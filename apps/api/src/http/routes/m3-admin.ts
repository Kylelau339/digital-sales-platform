import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import type { Database, Row } from '../../db/types.js';
import { createSqliteRepositories } from '../../repositories/sqlite/index.js';
import { requireAdminUser, requestMeta } from '../plugins/roles.js';
import type { RefundService } from '../../refunds/service.js';
import type { createTakedownService } from '../../admin/takedown.js';

const pageSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).default(0) });
const listSchema = pageSchema.extend({ status: z.string().trim().min(1).optional() });
const approveSchema = z.object({ amountUsdCents: z.number().int().min(1), reason: z.string().trim().min(8).max(2000) }).strict();
const rejectSchema = z.object({ reason: z.string().trim().min(8).max(2000) }).strict();
const takedownSchema = z.object({ mode: z.enum(['suspend', 'remove']), reason: z.string().trim().min(8).max(2000) }).strict();

function requireIdempotencyKey(request: { headers: Record<string, unknown> }): string {
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string' || key.length < 8 || key.length > 128) throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 422, 'A valid Idempotency-Key is required.');
  return key;
}

function refundView(row: Row<'refund_requests'>) {
  return { id: row.id, complaintId: row.complaint_id, orderId: row.order_id, amountMinor: row.amount_minor, currency: row.currency, status: row.status, stripeRefundId: row.stripe_refund_id, failureReason: row.failure_reason, productRefundCents: row.product_refund_cents, taxRefundCents: row.tax_refund_cents, platformFeeReversalCents: row.platform_fee_reversal_cents, sellerReversalCents: row.seller_reversal_cents, createdAt: row.created_at, updatedAt: row.updated_at };
}

function paymentView(row: Row<'transactions'>) {
  return { id: row.id, provider: row.provider, type: row.type, amountMinor: row.amount_minor, currency: row.currency, providerTransactionId: row.provider_transaction_id, status: row.status, createdAt: row.created_at };
}

export function registerM3AdminRoutes(app: FastifyInstance, db: Kysely<Database>, refundService: RefundService | null, takedownService: ReturnType<typeof createTakedownService>): void {
  const repos = createSqliteRepositories(db);

  app.get('/api/v1/admin/complaints', async request => {
    await requireAdminUser(db, request);
    const query = listSchema.parse(request.query);
    if (!refundService) throw new DomainError(ERROR_CODES.INTERNAL_ERROR, 500, 'Refund service is not configured.');
    const page = await refundService.list(query.status, { limit: query.limit, offset: query.offset });
    const items = [];
    for (const item of page.items) {
      const complaint = await repos.complaints.findById(item.complaint.id);
      items.push({ complaint, order: item.order, templateName: item.templateName, buyerEmail: item.buyerEmail, sellerId: item.sellerId, downloadCount: item.downloadCount, refund: item.refund ? refundView(item.refund) : null });
    }
    return { items, total: page.total };
  });

  app.get('/api/v1/admin/complaints/:id', async request => {
    await requireAdminUser(db, request);
    if (!refundService) throw new DomainError(ERROR_CODES.INTERNAL_ERROR, 500, 'Refund service is not configured.');
    const id = z.string().trim().min(1).parse((request.params as { id: string }).id);
    const detail = await refundService.detail(id);
    const complaint = await repos.complaints.findById(id);
    const template = await db.selectFrom('template_products').select(['name_json', 'seller_id']).where('id', '=', detail.order.templateId).executeTakeFirst();
    const buyer = await db.selectFrom('users').select('email').where('id', '=', detail.order.buyerId).executeTakeFirst();
    const seller = await db.selectFrom('users').select(['display_name', 'email']).where('id', '=', detail.order.sellerId).executeTakeFirst();
    return {
      complaint,
      order: detail.order,
      template: template ? { name: JSON.parse(template.name_json), sellerId: template.seller_id } : null,
      buyer: buyer ? { email: buyer.email } : null,
      seller: seller ? { displayName: seller.display_name, email: seller.email } : null,
      payment: detail.payment ? paymentView(detail.payment) : null,
      entitlements: detail.entitlements.map(row => ({ id: row.id, status: row.status, downloadCount: row.download_count, maxDownloads: row.max_downloads, expiresAt: row.expires_at, revokeReasonPublic: row.revoke_reason_public })),
      refunds: detail.refunds.map(refundView),
      evaluation: detail.evaluation,
      downloadCount: detail.downloadCount
    };
  });

  app.post('/api/v1/admin/complaints/:id/refund/approve', { config: { sessionWrite: true } }, async request => {
    const user = await requireAdminUser(db, request);
    if (!refundService) throw new DomainError(ERROR_CODES.INTERNAL_ERROR, 500, 'Refund service is not configured.');
    const key = requireIdempotencyKey(request as unknown as { headers: Record<string, unknown> });
    const id = z.string().trim().min(1).parse((request.params as { id: string }).id);
    const body = approveSchema.parse(request.body);
    return refundService.approve({ complaintId: id, actor: { id: user.id, email: user.email, type: 'user' }, amountMinor: body.amountUsdCents, reason: body.reason, idempotencyKey: key, meta: requestMeta(request) });
  });

  app.post('/api/v1/admin/complaints/:id/refund/reject', { config: { sessionWrite: true } }, async request => {
    const user = await requireAdminUser(db, request);
    if (!refundService) throw new DomainError(ERROR_CODES.INTERNAL_ERROR, 500, 'Refund service is not configured.');
    requireIdempotencyKey(request as unknown as { headers: Record<string, unknown> });
    const id = z.string().trim().min(1).parse((request.params as { id: string }).id);
    const body = rejectSchema.parse(request.body);
    return refundService.reject({ complaintId: id, actor: { id: user.id, email: user.email, type: 'user' }, reason: body.reason, meta: requestMeta(request) });
  });

  app.post('/api/v1/admin/templates/:id/takedown', { config: { sessionWrite: true } }, async request => {
    const user = await requireAdminUser(db, request);
    requireIdempotencyKey(request as unknown as { headers: Record<string, unknown> });
    const id = z.string().trim().min(1).parse((request.params as { id: string }).id);
    const body = takedownSchema.parse(request.body);
    return takedownService.execute({ templateId: id, mode: body.mode, reason: body.reason, actor: { id: user.id, email: user.email }, meta: requestMeta(request) });
  });

  app.get('/api/v1/admin/templates', async request => {
    await requireAdminUser(db, request);
    const query = z.object({ status: z.string().trim().min(1).default('approved'), limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(request.query);
    const rows = await db.selectFrom('template_products').selectAll().where('status', '=', query.status).orderBy('updated_at', 'desc').limit(query.limit).execute();
    return { items: rows.map(row => ({ id: row.id, name: JSON.parse(row.name_json), summary: JSON.parse(row.summary_json), status: row.status, priceUsdCents: row.price_usd_cents, version: row.version, currentVersionId: row.current_version_id, sellerId: row.seller_id, updatedAt: row.updated_at })), total: rows.length };
  });

  app.get('/api/v1/admin/audit', async request => {
    await requireAdminUser(db, request);
    return repos.audit.list(pageSchema.parse(request.query));
  });
}
