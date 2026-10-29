import Stripe from 'stripe';
import { createHash } from 'node:crypto';
import type { Kysely, Transaction } from 'kysely';
import type { Database, Row } from '../db/types.js';
import type { Order } from '@shared/contracts/domain.js';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import { id, nowUtc } from '@shared/time.js';
import { createSqliteRepositories } from '../repositories/sqlite/index.js';
import { evaluateRefundPolicy, type RefundBlocker } from '../domain/refunds/policy.js';
import type { ComplaintReason } from '@shared/enums/domain.js';

export interface RefundClient {
  create(input: { paymentIntent: string; amountMinor: number; currency: string; complaintId: string; orderId: string; idempotencyKey: string }): Promise<{ id: string; status: 'pending' | 'succeeded' | 'failed' | 'canceled'; amount: number; currency: string }>;
}

export function createStripeRefundClient(secretKey: string | undefined): RefundClient | null {
  if (!secretKey) return null;
  if (!secretKey.startsWith('sk_test_')) throw new DomainError(ERROR_CODES.INTERNAL_ERROR, 500, 'Refunds require a Stripe test secret key.');
  const stripe = new Stripe(secretKey);
  return {
    async create(input) {
      const refund = await stripe.refunds.create({
        payment_intent: input.paymentIntent,
        amount: input.amountMinor,
        reason: 'requested_by_customer',
        metadata: { complaint_id: input.complaintId, order_id: input.orderId }
      }, { idempotencyKey: input.idempotencyKey });
      const status = refund.status === 'succeeded' ? 'succeeded' : refund.status === 'failed' || refund.status === 'canceled' ? 'failed' : 'pending';
      return { id: refund.id, status, amount: refund.amount, currency: refund.currency.toUpperCase() };
    }
  };
}

export interface RefundActor { id: string; email: string | null; type: 'user' | 'system'; }
export interface RequestMeta { requestId: string | null; ip: string | null; userAgent: string | null; }

interface ComplaintRow extends Row<'complaints'>, Record<string, unknown> {}

function requestHash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

async function appendAudit(trx: Transaction<Database>, input: { actor: RefundActor; action: string; targetId: string; diff: Array<{ field: string; before: unknown; after: unknown }>; reason: string; meta: RequestMeta; at: string }): Promise<void> {
  await trx.insertInto('audit_logs').values({ id: id('audit'), actor_type: input.actor.type, actor_id: input.actor.id, actor_email_snapshot: input.actor.email, action: input.action, target_type: 'complaint', target_id: input.targetId, diff_json: JSON.stringify(input.diff), reason: input.reason, request_id: input.meta.requestId, ip: input.meta.ip, user_agent: input.meta.userAgent, at: input.at }).execute();
}

async function appendTimeline(trx: Transaction<Database>, complaintId: string, event: string, actorId: string, note: string | null, at: string): Promise<void> {
  await trx.insertInto('complaint_timeline').values({ id: `${complaintId}:${event}:${id('tl')}`, complaint_id: complaintId, event, actor_id: actorId, note, at }).execute();
}

async function loadComplaintContext(db: Kysely<Database>, complaintId: string): Promise<{ complaint: ComplaintRow; order: Order; payment: Row<'transactions'> | undefined; downloadCount: number }> {
  const complaint = await db.selectFrom('complaints').selectAll().where('id', '=', complaintId).executeTakeFirst();
  if (!complaint) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Complaint not found.');
  const order = await createSqliteRepositories(db).orders.findById(complaint.order_id);
  if (!order) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Order not found.');
  const payment = await db.selectFrom('transactions').selectAll().where('order_id', '=', order.id).where('provider', '=', 'stripe').where('type', '=', 'payment').where('status', '=', 'succeeded').orderBy('created_at', 'desc').executeTakeFirst();
  const entitlements = await db.selectFrom('entitlements').select('download_count').where('order_id', '=', order.id).execute();
  const downloadCount = entitlements.reduce((max, item) => Math.max(max, item.download_count), 0);
  return { complaint: complaint as ComplaintRow, order, payment, downloadCount };
}

async function finalizeRefund(trx: Transaction<Database>, requestId: string, actor: RefundActor, meta: RequestMeta, at: string, note: string): Promise<void> {
  const request = await trx.selectFrom('refund_requests').selectAll().where('id', '=', requestId).executeTakeFirst();
  if (!request) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Refund request not found.');
  const alreadySucceeded = request.status === 'succeeded';
  await trx.updateTable('refund_requests').set({ status: 'succeeded', failure_reason: null, updated_at: at }).where('id', '=', request.id).execute();
  await trx.updateTable('transactions').set({ status: 'succeeded', processed_at: at }).where('refund_request_id', '=', request.id).execute();
  await trx.updateTable('orders').set({ payment_status: 'refunded', order_status: 'refunded', updated_at: at }).where('id', '=', request.order_id).execute();
  await trx.updateTable('complaints').set({ refund_decision: 'approved', refund_amount_usd_cents: request.amount_minor, status: 'resolved', updated_at: at }).where('id', '=', request.complaint_id).execute();
  await trx.updateTable('entitlements').set({ status: 'revoked', revoke_reason_public: 'Order refunded', revoke_reason_internal: `Refund ${request.id}`, updated_at: at }).where('order_id', '=', request.order_id).where('status', '!=', 'revoked').execute();
  if (!alreadySucceeded) {
    await appendTimeline(trx, request.complaint_id, 'refund_succeeded', actor.id, note, at);
    await appendAudit(trx, { actor, action: 'complaint.refund_succeeded', targetId: request.complaint_id, diff: [{ field: 'refundStatus', before: request.status, after: 'succeeded' }], reason: note, meta, at });
  }
}

async function failRefund(trx: Transaction<Database>, requestId: string, actor: RefundActor, meta: RequestMeta, at: string, reason: string): Promise<void> {
  const request = await trx.selectFrom('refund_requests').selectAll().where('id', '=', requestId).executeTakeFirst();
  if (!request || request.status === 'failed' || request.status === 'succeeded') return;
  await trx.updateTable('refund_requests').set({ status: 'failed', failure_reason: reason.slice(0, 500), updated_at: at }).where('id', '=', request.id).execute();
  await trx.updateTable('transactions').set({ status: 'failed', failure_reason: reason.slice(0, 500), processed_at: at }).where('refund_request_id', '=', request.id).execute();
  await trx.updateTable('complaints').set({ refund_decision: 'pending', status: 'triaged', updated_at: at }).where('id', '=', request.complaint_id).execute();
  await appendTimeline(trx, request.complaint_id, 'refund_failed', actor.id, reason.slice(0, 500), at);
  await appendAudit(trx, { actor, action: 'complaint.refund_failed', targetId: request.complaint_id, diff: [{ field: 'refundStatus', before: request.status, after: 'failed' }], reason, meta, at });
}

export function createRefundService(db: Kysely<Database>, client: RefundClient, verify: (rawBody: string, signature: string, secret: string) => any, webhookSecret: string | undefined) {
  const repos = createSqliteRepositories(db);

  return {
    async approve(input: { complaintId: string; actor: RefundActor; amountMinor: number; reason: string; idempotencyKey: string; meta: RequestMeta }): Promise<{ refundRequestId: string; status: string; replay: boolean }> {
      const at = nowUtc();
      const { complaint, order, payment, downloadCount } = await loadComplaintContext(db, input.complaintId);
      if (complaint.status === 'rejected') throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Rejected complaints cannot be refunded.');
      if (complaint.refund_decision === 'approved' || complaint.status === 'resolved') {
        const prior = await db.selectFrom('refund_requests').selectAll().where('complaint_id', '=', complaint.id).where('status', '=', 'succeeded').executeTakeFirst();
        if (prior) return { refundRequestId: prior.id, status: prior.status, replay: true };
        throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Complaint is already approved.');
      }
      if (!payment?.provider_transaction_id) throw new DomainError(ERROR_CODES.CONFLICT, 409, 'The successful Stripe payment was not found.');
      const evaluation = evaluateRefundPolicy({ order, reason: complaint.reason as ComplaintReason, now: at, downloadCount });
      if (!evaluation.eligible) throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Refund is not allowed by the order policy.', { blockers: evaluation.blockers });
      if (input.amountMinor !== evaluation.fullRefundCents) throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Only a full refund of the order total is supported.', { expected: evaluation.fullRefundCents });
      if (order.paymentCurrency !== 'USD') throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Only USD refunds are supported.');
      if (order.platformFeeCents + order.sellerAmountCents !== order.priceCents) throw new DomainError(ERROR_CODES.INTERNAL_ERROR, 500, 'Order allocation is inconsistent.');

      const priorSucceeded = await db.selectFrom('refund_requests').selectAll().where('complaint_id', '=', complaint.id).where('status', '=', 'succeeded').executeTakeFirst();
      if (priorSucceeded) return { refundRequestId: priorSucceeded.id, status: priorSucceeded.status, replay: true };
      const priorPending = await db.selectFrom('refund_requests').selectAll().where('complaint_id', '=', complaint.id).where('status', '=', 'pending').executeTakeFirst();
      if (priorPending?.stripe_refund_id) return { refundRequestId: priorPending.id, status: priorPending.status, replay: true };

      const priorFailed = await db.selectFrom('refund_requests').selectAll().where('complaint_id', '=', complaint.id).where('status', '=', 'failed').where('idempotency_key', '=', input.idempotencyKey).orderBy('created_at', 'desc').executeTakeFirst();
      const taxRefund = input.amountMinor - order.priceCents;
      if (taxRefund < 0) throw new DomainError(ERROR_CODES.INTERNAL_ERROR, 500, 'Order tax allocation is inconsistent.');
      const hash = requestHash({ complaintId: complaint.id, amountMinor: input.amountMinor, reason: input.reason, key: input.idempotencyKey });
      let requestId: string;
      const retry = priorFailed ?? priorPending;
      if (retry) {
        requestId = retry.id;
        await db.transaction().execute(async trx => {
          await trx.updateTable('refund_requests').set({ status: 'pending', stripe_refund_id: null, failure_reason: null, requested_by: input.actor.id, amount_minor: input.amountMinor, idempotency_key: input.idempotencyKey, product_refund_cents: order.priceCents, tax_refund_cents: taxRefund, platform_fee_reversal_cents: order.platformFeeCents, seller_reversal_cents: order.sellerAmountCents, updated_at: at }).where('id', '=', requestId).execute();
          await trx.updateTable('complaints').set({ refund_decision: 'pending', status: 'triaged', updated_at: at }).where('id', '=', complaint.id).execute();
          await appendTimeline(trx, complaint.id, 'refund_requested', input.actor.id, input.reason, at);
        });
      } else {
        requestId = id('refund');
        await db.transaction().execute(async trx => {
          await trx.insertInto('refund_requests').values({ id: requestId, complaint_id: complaint.id, order_id: order.id, requested_by: input.actor.id, amount_minor: input.amountMinor, currency: 'USD', status: 'pending', stripe_refund_id: null, stripe_payment_intent: payment.provider_transaction_id as string, idempotency_key: input.idempotencyKey, failure_reason: null, product_refund_cents: order.priceCents, tax_refund_cents: taxRefund, platform_fee_reversal_cents: order.platformFeeCents, seller_reversal_cents: order.sellerAmountCents, created_at: at, updated_at: at }).execute();
          await trx.updateTable('complaints').set({ refund_decision: 'pending', status: 'triaged', updated_at: at }).where('id', '=', complaint.id).execute();
          await appendTimeline(trx, complaint.id, 'refund_requested', input.actor.id, input.reason, at);
        });
      }

      let result: Awaited<ReturnType<RefundClient['create']>>;
      try {
        result = await client.create({ paymentIntent: payment.provider_transaction_id, amountMinor: input.amountMinor, currency: 'USD', complaintId: complaint.id, orderId: order.id, idempotencyKey: `refund:${complaint.id}` });
      } catch (error) {
        await db.transaction().execute(async trx => { await failRefund(trx, requestId, input.actor, input.meta, nowUtc(), error instanceof Error ? error.message : 'Stripe refund failed.'); });
        throw new DomainError(ERROR_CODES.INTERNAL_ERROR, 500, 'Stripe refund failed.', { refundRequestId: requestId });
      }
      if (result.amount !== input.amountMinor || result.currency !== 'USD') {
        await db.transaction().execute(async trx => { await failRefund(trx, requestId, input.actor, input.meta, nowUtc(), 'Stripe refund amount or currency mismatch.'); });
        throw new DomainError(ERROR_CODES.PAYMENT_AMOUNT_MISMATCH, 409, 'Stripe refund amount or currency mismatch.');
      }

      const status = result.status;
      const at2 = nowUtc();
      await db.transaction().execute(async trx => {
        const request = await trx.selectFrom('refund_requests').selectAll().where('id', '=', requestId).executeTakeFirstOrThrow();
        await trx.updateTable('refund_requests').set({ stripe_refund_id: result.id, status: 'pending', failure_reason: null, updated_at: at2 }).where('id', '=', requestId).execute();
        const existingTx = await trx.selectFrom('transactions').select('id').where('refund_request_id', '=', requestId).executeTakeFirst();
        if (!existingTx) {
          await trx.insertInto('transactions').values({ id: id('txn'), order_id: order.id, parent_transaction_id: payment.id, provider: 'stripe', type: 'refund', amount_minor: input.amountMinor, pricing_amount_usd_cents: input.amountMinor, currency: 'USD', provider_transaction_id: result.id, event_id: null, idempotency_key: `refund:${complaint.id}`, status, signature_verified: 0, raw_event_hash: hash, failure_reason: status === 'failed' ? 'Stripe reported a failed refund.' : null, refund_request_id: request.id, created_at: at2, processed_at: status === 'pending' ? null : at2, chain: null, tx_hash: null, from_address: null, to_address: null, confirmations: null, required_confirmations: null }).execute();
        }
        if (status === 'succeeded') await finalizeRefund(trx, requestId, input.actor, input.meta, at2, input.reason);
        else if (status === 'failed') await failRefund(trx, requestId, input.actor, input.meta, at2, 'Stripe reported a failed refund.');
      });
      return { refundRequestId: requestId, status, replay: false };
    },

    async reject(input: { complaintId: string; actor: RefundActor; reason: string; meta: RequestMeta }): Promise<{ ok: true }> {
      const at = nowUtc();
      const complaint = await db.selectFrom('complaints').selectAll().where('id', '=', input.complaintId).executeTakeFirst();
      if (!complaint) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Complaint not found.');
      const active = await db.selectFrom('refund_requests').select('id').where('complaint_id', '=', complaint.id).where('status', 'in', ['pending', 'succeeded']).executeTakeFirst();
      if (active) throw new DomainError(ERROR_CODES.CONFLICT, 409, 'A refund is already pending or completed for this complaint.');
      await db.transaction().execute(async trx => {
        const changed = await trx.updateTable('complaints').set({ refund_decision: 'rejected', status: 'rejected', updated_at: at }).where('id', '=', complaint.id).where('refund_decision', '!=', 'approved').executeTakeFirst();
        if (Number(changed.numUpdatedRows) !== 1) throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Complaint state has changed.');
        await trx.insertInto('refund_requests').values({ id: id('refund'), complaint_id: complaint.id, order_id: complaint.order_id, requested_by: input.actor.id, amount_minor: 1, currency: 'USD', status: 'rejected', stripe_refund_id: null, stripe_payment_intent: 'none', idempotency_key: `reject:${complaint.id}:${id('k')}`, failure_reason: input.reason.slice(0, 500), product_refund_cents: 0, tax_refund_cents: 0, platform_fee_reversal_cents: 0, seller_reversal_cents: 0, created_at: at, updated_at: at }).execute();
        await appendTimeline(trx, complaint.id, 'refund_rejected', input.actor.id, input.reason, at);
        await appendAudit(trx, { actor: input.actor, action: 'complaint.refund_rejected', targetId: complaint.id, diff: [{ field: 'refundDecision', before: complaint.refund_decision, after: 'rejected' }], reason: input.reason, meta: input.meta, at });
      });
      return { ok: true };
    },

    async fulfill(rawBody: string, signature: string) {
      if (!webhookSecret) throw new DomainError(ERROR_CODES.PAYMENT_WEBHOOK_INVALID, 400, 'Stripe webhook secret is not configured.');
      let event: any;
      try { event = verify(rawBody, signature, webhookSecret); }
      catch { throw new DomainError(ERROR_CODES.PAYMENT_WEBHOOK_INVALID, 400, 'Stripe webhook signature is invalid.'); }
      if (!['refund.created', 'refund.updated', 'refund.failed'].includes(event.type)) return { ignored: true, duplicate: false };
      const refund = event.data.object as any;
      if (!refund?.id) throw new DomainError(ERROR_CODES.PAYMENT_WEBHOOK_INVALID, 400, 'Refund event is incomplete.');
      const payloadHash = createHash('sha256').update(rawBody).digest('hex');
      const at = nowUtc();
      const actor: RefundActor = { id: 'stripe-refund', email: null, type: 'system' };
      const meta: RequestMeta = { requestId: null, ip: null, userAgent: 'stripe-webhook' };
      try {
        await db.transaction().execute(async trx => {
          await trx.insertInto('payment_event_inbox').values({ provider: 'stripe', event_id: event.id, event_type: event.type, payload_hash: payloadHash, status: 'received', received_at: at, processed_at: null, last_error: null }).execute();
          const request = await trx.selectFrom('refund_requests').selectAll().where('stripe_refund_id', '=', String(refund.id)).executeTakeFirst();
          if (!request) {
            await trx.updateTable('payment_event_inbox').set({ status: 'processed', processed_at: at }).where('provider', '=', 'stripe').where('event_id', '=', event.id).execute();
            return;
          }
          if (Number(refund.amount) !== request.amount_minor || String(refund.currency).toUpperCase() !== request.currency) throw new DomainError(ERROR_CODES.PAYMENT_AMOUNT_MISMATCH, 409, 'Refund amount does not match the request.');
          const status = refund.status === 'succeeded' ? 'succeeded' : refund.status === 'failed' || refund.status === 'canceled' ? 'failed' : 'pending';
          await trx.updateTable('refund_requests').set({ status, failure_reason: status === 'failed' ? 'Stripe refund failed.' : null, updated_at: at }).where('id', '=', request.id).execute();
          const tx = await trx.selectFrom('transactions').select('id').where('refund_request_id', '=', request.id).executeTakeFirst();
          if (tx) await trx.updateTable('transactions').set({ status, signature_verified: 1, event_id: event.id, raw_event_hash: payloadHash, processed_at: at, failure_reason: status === 'failed' ? 'Stripe refund failed.' : null }).where('id', '=', tx.id).execute();
          else await trx.insertInto('transactions').values({ id: id('txn'), order_id: request.order_id, parent_transaction_id: null, provider: 'stripe', type: 'refund', amount_minor: request.amount_minor, pricing_amount_usd_cents: request.amount_minor, currency: request.currency, provider_transaction_id: String(refund.id), event_id: event.id, idempotency_key: `refund:${request.complaint_id}`, status, signature_verified: 1, raw_event_hash: payloadHash, failure_reason: status === 'failed' ? 'Stripe refund failed.' : null, refund_request_id: request.id, created_at: at, processed_at: at, chain: null, tx_hash: null, from_address: null, to_address: null, confirmations: null, required_confirmations: null }).execute();
          if (status === 'succeeded') await finalizeRefund(trx, request.id, actor, meta, at, 'Stripe refund succeeded.');
          else if (status === 'failed') await failRefund(trx, request.id, actor, meta, at, 'Stripe refund failed.');
          await trx.updateTable('payment_event_inbox').set({ status: 'processed', processed_at: at }).where('provider', '=', 'stripe').where('event_id', '=', event.id).execute();
        });
      } catch (error) {
        const existingEvent = await db.selectFrom('payment_event_inbox').select(['payload_hash']).where('provider', '=', 'stripe').where('event_id', '=', event.id).executeTakeFirst();
        if (existingEvent) {
          if (existingEvent.payload_hash !== payloadHash) throw new DomainError(ERROR_CODES.PAYMENT_WEBHOOK_INVALID, 400, 'Stripe event payload changed for an existing event.');
          return { ignored: true, duplicate: true };
        }
        throw error;
      }
      return { ignored: false, duplicate: false };
    },

    async detail(complaintId: string) {
      const { complaint, order, payment, downloadCount } = await loadComplaintContext(db, complaintId);
      const evaluation = evaluateRefundPolicy({ order, reason: complaint.reason as ComplaintReason, now: nowUtc(), downloadCount });
      const entitlements = await db.selectFrom('entitlements').selectAll().where('order_id', '=', order.id).execute();
      const refunds = await db.selectFrom('refund_requests').selectAll().where('complaint_id', '=', complaint.id).orderBy('created_at', 'desc').execute();
      return { complaint, order, payment: payment ?? null, entitlements, refunds, evaluation, downloadCount };
    },

    async list(status: string | undefined, page: { limit: number; offset: number }) {
      let query = db.selectFrom('complaints').selectAll();
      if (status) query = query.where('status', '=', status);
      const rows = await query.orderBy('created_at', 'desc').orderBy('id').limit(page.limit).offset(page.offset).execute();
      const countQuery = status ? db.selectFrom('complaints').select(({ fn }) => fn.countAll<number>().as('count')).where('status', '=', status) : db.selectFrom('complaints').select(({ fn }) => fn.countAll<number>().as('count'));
      const count = await countQuery.executeTakeFirstOrThrow();
      const items = [];
      for (const complaint of rows) {
        const order = await repos.orders.findById(complaint.order_id);
        const template = await db.selectFrom('template_products').select(['name_json', 'seller_id']).where('id', '=', complaint.template_id).executeTakeFirst();
        const buyer = await db.selectFrom('users').select('email').where('id', '=', order?.buyerId ?? '').executeTakeFirst();
        const entitlement = complaint.entitlement_id ? await db.selectFrom('entitlements').select('download_count').where('id', '=', complaint.entitlement_id).executeTakeFirst() : undefined;
        const refund = await db.selectFrom('refund_requests').selectAll().where('complaint_id', '=', complaint.id).orderBy('created_at', 'desc').executeTakeFirst();
        items.push({ complaint, order, templateName: template ? JSON.parse(template.name_json) : null, buyerEmail: buyer?.email ?? null, sellerId: template?.seller_id ?? null, downloadCount: entitlement?.download_count ?? 0, refund: refund ?? null });
      }
      return { items, total: Number(count.count) };
    }
  };
}

export type RefundService = ReturnType<typeof createRefundService>;
export type { RefundBlocker };
