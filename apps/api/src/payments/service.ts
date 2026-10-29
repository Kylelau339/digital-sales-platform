import Stripe from 'stripe';
import { createHash } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { Order } from '@shared/contracts/domain.js';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import { id, nowUtc, plusDays } from '@shared/time.js';
import { createSqliteRepositories } from '../repositories/sqlite/index.js';
import { LocalPrivateStorage } from '../storage/local-private-storage.js';

export interface CheckoutClient {
  create(input: { orderId: string; templateId: string; versionId: string; amountCents: number; licenseType: string; idempotencyKey: string }): Promise<{ id: string; url: string; expiresAt: string | null }>;
  verify(rawBody: string, signature: string, secret: string): any;
}

export function createStripeCheckoutClient(secretKey: string | undefined): CheckoutClient | null {
  if (!secretKey) return null;
  if (!secretKey.startsWith('sk_test_')) throw new DomainError(ERROR_CODES.INTERNAL_ERROR, 500, 'Checkout requires a Stripe test secret key.');
  const stripe = new Stripe(secretKey);
  return {
    async create(input) {
      const session = await (stripe.checkout.sessions.create as any)({ mode: 'payment', line_items: [{ price_data: { currency: 'usd', product_data: { name: `Motion template ${input.templateId}`, metadata: { template_id: input.templateId, version_id: input.versionId } }, unit_amount: input.amountCents }, quantity: 1 }], metadata: { order_id: input.orderId, template_id: input.templateId, version_id: input.versionId, license_type: input.licenseType }, success_url: process.env.STRIPE_CHECKOUT_SUCCESS_URL ?? 'https://localhost:5173/library?checkout=success', cancel_url: process.env.STRIPE_CHECKOUT_CANCEL_URL ?? 'https://localhost:5173/checkout/cancel', integration_identifier: 'motion-market', automatic_tax: { enabled: true } }, { idempotencyKey: input.idempotencyKey });
      return { id: session.id, url: session.url, expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null };
    },
    verify(rawBody, signature, secret) { return stripe.webhooks.constructEvent(rawBody, signature, secret); }
  };
}

export function createPaymentService(db: Kysely<Database>, privateRoot: string, client: CheckoutClient, webhookSecret: string | undefined) {
  const repos = createSqliteRepositories(db); const storage = new LocalPrivateStorage(privateRoot);
  async function assertPurchasable(templateId: string, licenseType: string) {
    const product = await repos.products.findById(templateId);
    if (!product || product.status !== 'approved' || !product.currentVersionId) throw new DomainError(ERROR_CODES.CHECKOUT_NOT_AVAILABLE, 409, 'Template is not available for checkout.');
    const version = await repos.versions.findById(product.currentVersionId);
    if (!version || version.status !== 'approved' || !version.immutable || version.scanStatus !== 'passed') throw new DomainError(ERROR_CODES.CHECKOUT_NOT_AVAILABLE, 409, 'Template version is not ready for checkout.');
    const file = await db.selectFrom('template_files').selectAll().where('version_id', '=', version.versionId).where('kind', '=', 'motion_package').where('artifact_status', '=', 'sanitized').executeTakeFirst();
    if (!file) throw new DomainError(ERROR_CODES.CHECKOUT_NOT_AVAILABLE, 409, 'Sanitized delivery artifact is not available.');
    const artifact = await storage.stat(file.storage_key);
    if (!artifact || artifact.sizeBytes !== file.size_bytes || artifact.sha256 !== file.sha256) throw new DomainError(ERROR_CODES.CHECKOUT_NOT_AVAILABLE, 409, 'Sanitized delivery artifact is not available.');
    const pricing = product.licensePricing.find(item => item.licenseType === licenseType);
    if (!pricing) throw new DomainError(ERROR_CODES.CHECKOUT_NOT_AVAILABLE, 422, 'License type is not available.');
    return { product, version, file, pricing };
  }
  return {
    async createCheckout(buyerId: string, templateId: string, licenseType: string, requestKey: string) {
      const { product, version, pricing } = await assertPurchasable(templateId, licenseType);
      const priceCents = pricing.priceUsdCents;
      const order = await repos.orders.createSingleItemPendingPayment({ id: id('order'), orderNo: id('orderno'), buyerId, sellerId: product.sellerId, templateId, versionId: version.versionId, licenseType: licenseType as Order['licenseType'], licensePriceFactor: pricing.factor, priceCents, paymentCurrency: 'USD', paymentAmountMinor: priceCents, quoteRate: null, quoteExpiresAt: null, platformFeeCents: 0, sellerAmountCents: priceCents, taxSnapshot: { automaticTax: false, status: 'not_enabled' }, idempotencyKey: requestKey, now: nowUtc() });
      const session = await client.create({ orderId: order.id, templateId, versionId: version.versionId, amountCents: priceCents, licenseType, idempotencyKey: `checkout:${order.id}` });
      await db.updateTable('orders').set({ stripe_checkout_session_id: session.id, checkout_session_expires_at: session.expiresAt, updated_at: nowUtc() }).where('id', '=', order.id).where('payment_status', '=', 'pending').execute();
      return { orderId: order.id, checkoutSessionId: session.id, url: session.url };
    },
    async fulfill(rawBody: string, signature: string) {
      if (!webhookSecret) throw new DomainError(ERROR_CODES.PAYMENT_WEBHOOK_INVALID, 400, 'Stripe webhook secret is not configured.');
      let event: any;
      try { event = client.verify(rawBody, signature, webhookSecret); }
      catch { throw new DomainError(ERROR_CODES.PAYMENT_WEBHOOK_INVALID, 400, 'Stripe webhook signature is invalid.'); }
      if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return { ignored: true, duplicate: false };
      const session = event.data.object as any;
      if (session.livemode || session.payment_status !== 'paid') return { ignored: true, duplicate: false };
      if (session.mode !== 'payment' || !session.payment_intent) throw new DomainError(ERROR_CODES.PAYMENT_AMOUNT_MISMATCH, 409, 'Checkout session is not a completed one-time payment.');
      const metadata = session.metadata ?? {};
      const orderId = String(metadata.order_id ?? '');
      const templateId = String(metadata.template_id ?? '');
      const versionId = String(metadata.version_id ?? '');
      const licenseType = String(metadata.license_type ?? '');
      if (!orderId || !templateId || !versionId || !licenseType || !event.id) {
        throw new DomainError(ERROR_CODES.PAYMENT_AMOUNT_MISMATCH, 409, 'Checkout session metadata is incomplete.');
      }
      const order = await db.selectFrom('orders').selectAll().where('id', '=', orderId).executeTakeFirst();
      if (!order || order.stripe_checkout_session_id !== session.id || order.template_id !== templateId || order.version_id !== versionId || order.license_type !== licenseType) throw new DomainError(ERROR_CODES.PAYMENT_AMOUNT_MISMATCH, 409, 'Checkout session does not match the order.');
      const amountSubtotal = Number(session.amount_subtotal);
      const amountTotal = Number(session.amount_total);
      const amountTax = Number(session.total_details?.amount_tax ?? 0);
      if (amountSubtotal !== order.payment_amount_minor || amountTotal !== amountSubtotal + amountTax || amountTax < 0 || String(session.currency).toUpperCase() !== order.payment_currency) throw new DomainError(ERROR_CODES.PAYMENT_AMOUNT_MISMATCH, 409, 'Checkout amount does not match the order.');
      const payloadHash = createHash('sha256').update(rawBody).digest('hex'); const at = nowUtc();
      try {
        await db.transaction().execute(async trx => {
          await trx.insertInto('payment_event_inbox').values({ provider: 'stripe', event_id: event.id, event_type: event.type, payload_hash: payloadHash, status: 'received', received_at: at, processed_at: null, last_error: null }).execute();
          const current = await trx.selectFrom('orders').selectAll().where('id', '=', orderId).executeTakeFirstOrThrow();
          if (current.payment_status === 'paid') {
            const priorPayment = await trx.selectFrom('transactions').select('provider_transaction_id').where('order_id', '=', orderId).where('provider', '=', 'stripe').where('type', '=', 'payment').executeTakeFirst();
            if (!priorPayment || priorPayment.provider_transaction_id !== String(session.payment_intent)) throw new DomainError(ERROR_CODES.PAYMENT_AMOUNT_MISMATCH, 409, 'Paid order has a different Stripe payment.');
            await trx.updateTable('payment_event_inbox').set({ status: 'processed', processed_at: at }).where('provider', '=', 'stripe').where('event_id', '=', event.id).execute();
            return;
          }
          const changed = await trx.updateTable('orders').set({ payment_status: 'paid', order_status: 'fulfilled', paid_at: at, tax_snapshot_json: JSON.stringify({ automaticTax: true, amountTax, amountSubtotal, amountTotal, stripeTotalDetails: session.total_details ?? null }), updated_at: at }).where('id', '=', orderId).where('payment_status', '=', 'pending').executeTakeFirst();
          if (Number(changed.numUpdatedRows) !== 1) throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Order changed while fulfilling checkout.');
          await trx.insertInto('transactions').values({ id: id('txn'), order_id: orderId, parent_transaction_id: null, provider: 'stripe', type: 'payment', amount_minor: order.payment_amount_minor, pricing_amount_usd_cents: order.price_cents, currency: order.payment_currency, provider_transaction_id: String(session.payment_intent ?? session.id), event_id: event.id, idempotency_key: `stripe:${session.payment_intent ?? session.id}`, status: 'succeeded', signature_verified: 1, raw_event_hash: payloadHash, failure_reason: null, created_at: at, processed_at: at, chain: null, tx_hash: null, from_address: null, to_address: null, confirmations: null, required_confirmations: null }).execute();
          await trx.insertInto('entitlements').values({ id: id('ent'), order_id: orderId, template_id: order.template_id, version_id: order.version_id, license_type: order.license_type, max_downloads: 10, download_count: 0, expires_at: plusDays(at, 365), status: 'active', reissued_from_id: null, reissued_to_id: null, revoke_reason_public: null, revoke_reason_internal: null, last_downloaded_at: null, created_at: at, updated_at: at }).execute();
          await trx.updateTable('payment_event_inbox').set({ status: 'processed', processed_at: at }).where('provider', '=', 'stripe').where('event_id', '=', event.id).execute();
        });
      } catch (error) {
        const existingEvent = await db.selectFrom('payment_event_inbox').select(['status', 'payload_hash']).where('provider', '=', 'stripe').where('event_id', '=', event.id).executeTakeFirst();
        if (existingEvent) {
          if (existingEvent.payload_hash !== payloadHash) throw new DomainError(ERROR_CODES.PAYMENT_WEBHOOK_INVALID, 400, 'Stripe event payload changed for an existing event.');
          return { ignored: true, duplicate: true };
        }
        const providerTransactionId = String(session.payment_intent ?? session.id);
        const existingTransaction = await db.selectFrom('transactions').select('id').where('provider', '=', 'stripe').where('provider_transaction_id', '=', providerTransactionId).executeTakeFirst();
        if (existingTransaction) return { ignored: true, duplicate: true };
        throw error;
      }
      return { ignored: false, duplicate: false };
    }
  };
}
