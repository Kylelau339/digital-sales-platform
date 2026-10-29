import { sql, type Kysely } from 'kysely';
import { z } from 'zod';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import type { AuditLog, AuthSession, Complaint, Entitlement, LicenseProof, Order, PreviewAsset, RefundPolicy, TemplateProduct, TemplateVersion, User } from '@shared/contracts/domain.js';
import * as E from '@shared/enums/domain.js';
import * as S from '@shared/schemas/domain.js';
import { nowUtc, id as makeId } from '@shared/time.js';
import type { Database, Patch, Row } from '../../db/types.js';
import type * as P from '../ports/index.js';
import * as M from './mapping.js';

const encode = (value: unknown): string => JSON.stringify(value);
const page = (input: P.PageInput) => S.validate(z.object({ limit: z.number().int().min(1).max(100), offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }), input);
const required = <T>(value: T | null | undefined, message: string): T => {
  if (value == null) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, message);
  return value;
};
function databaseError(error: unknown): never {
  if (error instanceof DomainError) throw error;
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    if (error.code.startsWith('SQLITE_CONSTRAINT') || error.code.startsWith('SQLITE_BUSY') || error.code === 'SQLITE_LOCKED') {
      throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Persistence conflict; the transaction was rolled back.');
    }
  }
  throw error;
}
let savepointSequence = 0;
/** Savepoints preserve operation atomicity when called inside a larger repository unit of work. */
async function atomic<T>(db: Kysely<Database>, work: (db: Kysely<Database>) => Promise<T>): Promise<T> {
  try {
    if (!db.isTransaction) return await db.transaction().execute(async trx => {
      // Reserve a writer before reads to avoid deferred-transaction snapshot upgrade races.
      await sql`UPDATE schema_migrations SET applied_at=applied_at WHERE name='__repository_lock__'`.execute(trx);
      return work(trx);
    });
    const name = `repository_${++savepointSequence}`;
    await sql.raw(`SAVEPOINT ${name}`).execute(db);
    try { const result = await work(db); await sql.raw(`RELEASE SAVEPOINT ${name}`).execute(db); return result; }
    catch (error) { await sql.raw(`ROLLBACK TO SAVEPOINT ${name}`).execute(db); await sql.raw(`RELEASE SAVEPOINT ${name}`).execute(db); throw error; }
  } catch (error) { databaseError(error); }
}
async function auditChange(db: Kysely<Database>, input: { actorId: string; action: string; targetType: string; targetId: string; diff: AuditLog['diff']; reason: string; at: string }): Promise<void> {
  if (!input.diff.length) return;
  await new SqliteAuditLogRepository(db).append({ id: makeId('audit'), actor: { type: 'user', id: input.actorId, emailSnapshot: null }, action: input.action, targetType: input.targetType, targetId: input.targetId, diff: input.diff, reason: input.reason, requestId: null, ip: null, userAgent: null, at: input.at });
}

class SqliteUserRepository implements P.UserRepository {
  constructor(private readonly db: Kysely<Database>) {}
  async create(input: P.CreateUserInput): Promise<User> {
    const user = S.validate(S.userSchema, { ...input, authStatus: 'pending_email', emailVerifiedAt: null, createdAt: input.now, updatedAt: input.now });
    return atomic(this.db, async db => {
      await db.insertInto('users').values({ id: user.id, email: user.email, password_hash: user.passwordHash, auth_status: user.authStatus, roles_json: encode([...new Set(user.roles)]), display_name: user.displayName, email_verified_at: null, created_at: user.createdAt, updated_at: user.updatedAt }).execute();
      return required(await new SqliteUserRepository(db).findById(user.id), 'User not found.');
    });
  }
  async findById(id: string): Promise<User | null> { const row = await this.db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst(); return row ? M.mapUser(row) : null; }
  async findByEmail(email: string): Promise<User | null> { const row = await this.db.selectFrom('users').selectAll().where('email', '=', S.validate(z.email().toLowerCase(), email)).executeTakeFirst(); return row ? M.mapUser(row) : null; }
  async updateAuthStatus(id: string, status: E.AuthStatus): Promise<User> {
    S.validate(z.enum(E.AUTH_STATUSES), status);
    return atomic(this.db, async db => {
      const repo = new SqliteUserRepository(db);
      const old = required(await repo.findById(id), 'User not found.');
      if (old.authStatus === status) return old;
      const at = nowUtc();
      await db.updateTable('users').set({ auth_status: status, updated_at: at }).where('id', '=', id).execute();
      if (status === 'locked' || status === 'disabled') await db.updateTable('auth_sessions').set({ revoked_at: at }).where('user_id', '=', id).where('revoked_at', 'is', null).execute();
      await auditChange(db, { actorId: id, action: 'user.auth_status_changed', targetType: 'user', targetId: id, diff: [{ field: 'authStatus', before: old.authStatus, after: status }], reason: 'Authentication status changed.', at });
      return required(await repo.findById(id), 'User not found.');
    });
  }
  async addRole(id: string, role: E.UserRole): Promise<User> {
    S.validate(z.enum(E.USER_ROLES), role);
    return atomic(this.db, async db => {
      const repo = new SqliteUserRepository(db);
      const old = required(await repo.findById(id), 'User not found.');
      if (old.roles.includes(role)) return old;
      const roles = [...old.roles, role]; const at = nowUtc();
      await db.updateTable('users').set({ roles_json: encode(roles), updated_at: at }).where('id', '=', id).execute();
      await auditChange(db, { actorId: id, action: 'user.role_added', targetType: 'user', targetId: id, diff: [{ field: 'roles', before: old.roles, after: roles }], reason: 'Role added.', at });
      return required(await repo.findById(id), 'User not found.');
    });
  }
}

class SqliteSessionRepository implements P.SessionRepository {
  constructor(private readonly db: Kysely<Database>) {}
  async create(input: P.CreateSessionInput): Promise<AuthSession> {
    const session = S.validate(S.sessionSchema.refine(s => s.expiresAt > s.createdAt, 'Session must expire after creation.'), { ...input, revokedAt: null });
    return atomic(this.db, async db => {
      const user = await db.selectFrom('users').select('auth_status').where('id', '=', session.userId).executeTakeFirst();
      if (!user || ['locked', 'disabled'].includes(user.auth_status)) throw new DomainError(ERROR_CODES.FORBIDDEN, 403, 'This account is not available.');
      await db.insertInto('auth_sessions').values({ id: session.id, user_id: session.userId, csrf_token_hash: session.csrfTokenHash, expires_at: session.expiresAt, revoked_at: null, created_at: session.createdAt }).execute();
      return session;
    });
  }
  async findValidById(id: string, now: string): Promise<AuthSession | null> {
    const at = S.validate(S.timestampSchema, now);
    const row = await this.db.selectFrom('auth_sessions').innerJoin('users', 'users.id', 'auth_sessions.user_id').select(['auth_sessions.id','auth_sessions.user_id','auth_sessions.csrf_token_hash','auth_sessions.expires_at','auth_sessions.revoked_at','auth_sessions.created_at']).where('auth_sessions.id', '=', id).where('auth_sessions.revoked_at', 'is', null).where('auth_sessions.expires_at', '>', at).where('users.auth_status', 'not in', ['locked', 'disabled']).executeTakeFirst(); return row ? M.mapSession(row) : null;
  }
  async rotateCsrfToken(id: string, hash: string): Promise<void> { S.validate(S.keySchema, hash); await atomic(this.db, async db => { const result = await db.updateTable('auth_sessions').set({ csrf_token_hash: hash }).where('id', '=', id).where('revoked_at', 'is', null).executeTakeFirst(); if (!result.numUpdatedRows) throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Session is not available.'); }); }
  async revoke(id: string, at: string): Promise<void> { const time = S.validate(S.timestampSchema, at); await atomic(this.db, async db => { await db.updateTable('auth_sessions').set({ revoked_at: time }).where('id', '=', id).where('revoked_at', 'is', null).execute(); }); }
}

class SqliteTemplateProductRepository implements P.TemplateProductRepository {
  constructor(private readonly db: Kysely<Database>) {}
  async createDraft(input: P.CreateTemplateProductInput): Promise<TemplateProduct> {
    const p = S.validate(S.createProductSchema, input);
    return atomic(this.db, async db => { await db.insertInto('template_products').values({ id: p.id, seller_id: p.sellerId, name_json: encode(p.name), summary_json: encode(p.summary), category: p.category, tags_json: '[]', license_types_json: encode(p.licenseTypes), license_pricing_json: encode(p.licensePricing), price_usd_cents: p.priceUsdCents, status: 'draft', published_at: null, current_version_id: null, version: p.version, rating: 0, rating_count: 0, sales_recent_json: '0', early_signal_json: '{}', ranking_updated_at: null, updated_at: p.now, created_at: p.now }).execute(); return required(await new SqliteTemplateProductRepository(db).findById(p.id), 'Template not found.'); });
  }
  async findById(id: string): Promise<TemplateProduct | null> { const row = await this.db.selectFrom('template_products').selectAll().where('id', '=', id).executeTakeFirst(); return row ? M.mapProduct(row) : null; }
  async listBySeller(sellerId: string, input: P.PageInput): Promise<P.Page<TemplateProduct>> {
    const p = page(input);
    const rows = await this.db.selectFrom('template_products').selectAll().where('seller_id', '=', sellerId).orderBy('created_at', 'desc').orderBy('id').limit(p.limit).offset(p.offset).execute();
    const count = await this.db.selectFrom('template_products').select(({ fn }) => fn.countAll<number>().as('count')).where('seller_id', '=', sellerId).executeTakeFirstOrThrow(); return { items: rows.map(M.mapProduct), total: Number(count.count) };
  }
  async updateDraft(id: string, input: P.UpdateTemplateDraftInput): Promise<TemplateProduct> {
    const patch = S.validate(S.draftPatchSchema, input);
    return atomic(this.db, async db => {
      const repo = new SqliteTemplateProductRepository(db); const old = required(await repo.findById(id), 'Template not found.');
      if (old.status !== 'draft') throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Only drafts are editable.');
      const values: Patch<'template_products'> = { updated_at: nowUtc() };
      if (patch.name !== undefined) values.name_json = encode(patch.name);
      if (patch.summary !== undefined) values.summary_json = encode(patch.summary);
      if (patch.category !== undefined) values.category = patch.category;
      if (patch.priceUsdCents !== undefined) values.price_usd_cents = patch.priceUsdCents;
      await db.updateTable('template_products').set(values).where('id', '=', id).where('status', '=', 'draft').execute();
      if (patch.priceUsdCents !== undefined && patch.priceUsdCents !== old.priceUsdCents) await auditChange(db, { actorId: old.sellerId, action: 'template.price_changed', targetType: 'template', targetId: id, diff: [{ field: 'priceUsdCents', before: old.priceUsdCents, after: patch.priceUsdCents }], reason: 'Draft price changed.', at: nowUtc() });
      return required(await repo.findById(id), 'Template not found.');
    });
  }
  async transitionStatus(id: string, from: E.TemplateStatus, to: E.TemplateStatus, reason: string, actorId: string): Promise<TemplateProduct> {
    S.validate(z.enum(E.TEMPLATE_STATUSES), from); S.validate(z.enum(E.TEMPLATE_STATUSES), to); S.validate(S.keySchema, reason); S.validate(S.keySchema, actorId);
    if (!E.TEMPLATE_TRANSITIONS[from].includes(to)) throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Template status transition is not allowed.');
    return atomic(this.db, async db => {
      const at = nowUtc();
      const result = await db.updateTable('template_products').set({ status: to, updated_at: at, ...(to === 'approved' ? { published_at: at } : {}) }).where('id', '=', id).where('status', '=', from).executeTakeFirst();
      if (!result.numUpdatedRows) throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Template state has changed.');
      await auditChange(db, { actorId, action: 'template.status_changed', targetType: 'template', targetId: id, diff: [{ field: 'status', before: from, after: to }], reason, at });
      return required(await new SqliteTemplateProductRepository(db).findById(id), 'Template not found.');
    });
  }
}

class SqliteTemplateVersionRepository implements P.TemplateVersionRepository {
  constructor(private readonly db: Kysely<Database>) {}
  async createDraft(input: P.CreateTemplateVersionInput): Promise<TemplateVersion> {
    const v = S.validate(S.createVersionSchema, input);
    return atomic(this.db, async db => {
      const product = required(await new SqliteTemplateProductRepository(db).findById(v.templateId), 'Template not found.');
      if (product.status === 'removed') throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Removed templates cannot receive versions.');
      await db.insertInto('template_versions').values({ version_id: v.versionId, template_id: v.templateId, version: v.version, status: 'draft', revision: 1, package_license_json: encode(v.packageLicense), license_text: v.licenseText, scan_job_id: null, scan_status: 'pending', conflict_flag: 0, conflict_reasons_json: '[]', immutable: 0, created_at: v.now, submitted_at: null, approved_at: null }).execute();
      if (v.files.length) await db.insertInto('template_files').values(v.files.map(f => ({ file_id: f.fileId, version_id: v.versionId, kind: f.kind, storage_key: f.storageKey, filename: f.filename, mime_type: f.mimeType, size_bytes: f.sizeBytes, sha256: f.sha256, artifact_status: 'unverified' }))).execute();
      return required(await new SqliteTemplateVersionRepository(db).findById(v.versionId), 'Version not found.');
    });
  }
  async findById(id: string): Promise<TemplateVersion | null> {
    const row = await this.db.selectFrom('template_versions').selectAll().where('version_id', '=', id).executeTakeFirst();
    if (!row) return null;
    const files = await this.db.selectFrom('template_files').selectAll().where('version_id', '=', id).orderBy('file_id').execute();
    return M.mapVersion(row, files);
  }
  async listHistory(templateId: string): Promise<TemplateVersion[]> {
    const rows = await this.db.selectFrom('template_versions').selectAll().where('template_id', '=', templateId).orderBy('created_at', 'desc').orderBy('version_id').execute();
    if (!rows.length) return [];
    const files = await this.db.selectFrom('template_files').selectAll().where('version_id', 'in', rows.map(row => row.version_id)).orderBy('file_id').execute();
    return rows.map(row => M.mapVersion(row, files.filter(file => file.version_id === row.version_id)));
  }
}

class SqliteRefundPolicyRepository implements P.RefundPolicyRepository {
  constructor(private readonly db: Kysely<Database>) {}
  async getCurrent(): Promise<RefundPolicy> {
    const rows = await this.db.selectFrom('refund_policies').selectAll().where('is_active', '=', 1).execute();
    if (rows.length !== 1) throw new DomainError(ERROR_CODES.CONFLICT, 409, 'There must be exactly one active refund policy.');
    return M.mapPolicy(required(rows[0], 'Active policy not found.'));
  }
  async findByVersion(version: string): Promise<RefundPolicy | null> { const row = await this.db.selectFrom('refund_policies').selectAll().where('version', '=', version).executeTakeFirst(); return row ? M.mapPolicy(row) : null; }
  async createVersion(input: P.CreateRefundPolicyInput): Promise<RefundPolicy> {
    const p = S.validate(S.createPolicySchema, input);
    return atomic(this.db, async db => {
      const old = await new SqliteRefundPolicyRepository(db).getCurrent();
      await db.updateTable('refund_policies').set({ is_active: 0 }).where('id', '=', old.id).where('is_active', '=', 1).execute();
      await db.insertInto('refund_policies').values({ id: p.id, version: p.version, window_days: p.windowDays, eligible_json: encode(p.eligible), exclusions_json: encode(p.exclusions), window_exempt_reasons_json: encode(p.windowExemptReasons), manual_review_required: p.manualReviewRequired ? 1 : 0, is_active: 1, created_at: p.createdAt }).execute();
      await new SqliteAuditLogRepository(db).append({ id: makeId('audit'), actor: { type: 'system', id: 'refund-policy', emailSnapshot: null }, action: 'refund_policy.activated', targetType: 'refund_policy', targetId: p.id, diff: [{ field: 'activeVersion', before: old.version, after: p.version }], reason: 'Refund policy version activated.', requestId: null, ip: null, userAgent: null, at: p.createdAt });
      return new SqliteRefundPolicyRepository(db).getCurrent();
    });
  }
}

class SqliteOrderRepository implements P.OrderRepository {
  constructor(private readonly db: Kysely<Database>) {}
  async createSingleItemPendingPayment(input: P.CreateSingleItemOrderInput): Promise<Order> {
    const o = S.validate(S.createOrderSchema, input);
    return atomic(this.db, async db => {
      const repo = new SqliteOrderRepository(db);
      const existing = await db.selectFrom('orders').selectAll().where('idempotency_key', '=', o.idempotencyKey).executeTakeFirst();
      if (existing) {
        const same = existing.buyer_id === o.buyerId && existing.seller_id === o.sellerId && existing.template_id === o.templateId && existing.version_id === o.versionId && existing.license_type === o.licenseType && existing.license_price_factor === o.licensePriceFactor && existing.price_cents === o.priceCents && existing.payment_currency === o.paymentCurrency && existing.payment_amount_minor === o.paymentAmountMinor && existing.quote_rate_json === (o.quoteRate ? encode(o.quoteRate) : null) && existing.quote_expires_at === o.quoteExpiresAt && existing.quote_id === o.quoteId && existing.platform_fee_cents === o.platformFeeCents && existing.seller_amount_cents === o.sellerAmountCents && existing.tax_snapshot_json === encode(o.taxSnapshot);
        if (!same) throw new DomainError(ERROR_CODES.IDEMPOTENCY_CONFLICT, 409, 'Idempotency key belongs to a different order request.');
        return required(await repo.findById(existing.id), 'Order not found.');
      }
      const policy = await new SqliteRefundPolicyRepository(db).getCurrent();
      const snapshot = S.validate(S.snapshotSchema, { windowDays: policy.windowDays, eligible: policy.eligible, exclusions: policy.exclusions, windowExemptReasons: policy.windowExemptReasons, manualReviewRequired: policy.manualReviewRequired });
      await db.insertInto('orders').values({ id: o.id, order_no: o.orderNo, buyer_id: o.buyerId, seller_id: o.sellerId, template_id: o.templateId, version_id: o.versionId, license_type: o.licenseType, license_price_factor: o.licensePriceFactor, price_cents: o.priceCents, pricing_currency: 'USD', payment_currency: o.paymentCurrency, payment_amount_minor: o.paymentAmountMinor, quote_rate_json: o.quoteRate ? encode(o.quoteRate) : null, quote_expires_at: o.quoteExpiresAt, quote_id: o.quoteId, refund_policy_version: policy.version, refund_policy_snapshot_json: encode(snapshot), platform_fee_cents: o.platformFeeCents, seller_amount_cents: o.sellerAmountCents, tax_snapshot_json: encode(o.taxSnapshot), payment_status: 'pending', order_status: 'pending_payment', paid_at: null, idempotency_key: o.idempotencyKey, created_at: o.now, updated_at: o.now }).execute();
      await db.insertInto('order_items').values({ order_id: o.id, template_id: o.templateId, version_id: o.versionId, license_type: o.licenseType, price_cents: o.priceCents }).execute();
      return required(await repo.findById(o.id), 'Order not found.');
    });
  }
  private async map(row: Row<'orders'> | undefined): Promise<Order | null> {
    if (!row) return null;
    return M.mapOrder(row, await this.db.selectFrom('order_items').selectAll().where('order_id', '=', row.id).execute());
  }
  async findById(id: string): Promise<Order | null> { return this.map(await this.db.selectFrom('orders').selectAll().where('id', '=', id).executeTakeFirst()); }
  async findByIdempotencyKey(key: string): Promise<Order | null> { return this.map(await this.db.selectFrom('orders').selectAll().where('idempotency_key', '=', key).executeTakeFirst()); }
}

class SqliteEntitlementRepository implements P.EntitlementRepository {
  constructor(private readonly db: Kysely<Database>) {}
  async findById(id: string): Promise<Entitlement | null> { const row = await this.db.selectFrom('entitlements').selectAll().where('id', '=', id).executeTakeFirst(); return row ? M.mapEntitlement(row) : null; }
  async listByBuyer(buyerId: string, input: P.PageInput): Promise<P.Page<Entitlement>> {
    const p = page(input);
    const rows = await this.db.selectFrom('entitlements').innerJoin('orders', 'orders.id', 'entitlements.order_id').selectAll('entitlements').where('orders.buyer_id', '=', buyerId).orderBy('entitlements.created_at', 'desc').orderBy('entitlements.id').limit(p.limit).offset(p.offset).execute();
    const count = await this.db.selectFrom('entitlements').innerJoin('orders', 'orders.id', 'entitlements.order_id').select(({ fn }) => fn.countAll<number>().as('count')).where('orders.buyer_id', '=', buyerId).executeTakeFirstOrThrow(); return { items: rows.map(M.mapEntitlement), total: Number(count.count) };
  }
}

class SqliteComplaintRepository implements P.ComplaintRepository {
  constructor(private readonly db: Kysely<Database>) {}
  async create(input: P.CreateComplaintInput): Promise<Complaint> {
    const c = S.validate(S.createComplaintSchema, input);
    return atomic(this.db, async db => {
      await db.insertInto('complaints').values({ id: c.id, order_id: c.orderId, entitlement_id: c.entitlementId, template_id: c.templateId, version_id: c.versionId, reason: c.reason, description: c.description, status: 'submitted', review_route: c.reviewRoute, refund_decision: 'not_requested', refund_amount_usd_cents: null, created_at: c.now, updated_at: c.now }).execute();
      await db.insertInto('complaint_timeline').values({ id: `${c.id}:submitted`, complaint_id: c.id, event: 'submitted', actor_id: c.actorId, note: null, at: c.now }).execute();
      return required(await new SqliteComplaintRepository(db).findById(c.id), 'Complaint not found.');
    });
  }
  async findById(id: string): Promise<Complaint | null> {
    const row = await this.db.selectFrom('complaints').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) return null;
    const timeline = await this.db.selectFrom('complaint_timeline').selectAll().where('complaint_id', '=', id).orderBy('at').orderBy('id').execute();
    return M.mapComplaint(row, timeline);
  }
}

class SqliteAuditLogRepository implements P.AuditLogRepository {
  constructor(private readonly db: Kysely<Database>) {}
  async append(input: P.AppendAuditLogInput): Promise<AuditLog> {
    const a = S.validate(S.auditSchema, input);
    return atomic(this.db, async db => { await db.insertInto('audit_logs').values({ id: a.id, actor_type: a.actor.type, actor_id: a.actor.id, actor_email_snapshot: a.actor.emailSnapshot, action: a.action, target_type: a.targetType, target_id: a.targetId, diff_json: encode(a.diff), reason: a.reason, request_id: a.requestId, ip: a.ip, user_agent: a.userAgent, at: a.at }).execute(); return M.mapAudit(await db.selectFrom('audit_logs').selectAll().where('id', '=', a.id).executeTakeFirstOrThrow()); });
  }
  async listByTarget(targetType: string, targetId: string, input: P.PageInput): Promise<P.Page<AuditLog>> {
    const p = page(input);
    const rows = await this.db.selectFrom('audit_logs').selectAll().where('target_type', '=', targetType).where('target_id', '=', targetId).orderBy('at', 'desc').orderBy('id').limit(p.limit).offset(p.offset).execute();
    const count = await this.db.selectFrom('audit_logs').select(({ fn }) => fn.countAll<number>().as('count')).where('target_type', '=', targetType).where('target_id', '=', targetId).executeTakeFirstOrThrow(); return { items: rows.map(M.mapAudit), total: Number(count.count) };
  }
  async list(input: P.PageInput): Promise<P.Page<AuditLog>> { const p = page(input); const rows = await this.db.selectFrom('audit_logs').selectAll().orderBy('at', 'desc').orderBy('id').limit(p.limit).offset(p.offset).execute(); const count = await this.db.selectFrom('audit_logs').select(({ fn }) => fn.countAll<number>().as('count')).executeTakeFirstOrThrow(); return { items: rows.map(M.mapAudit), total: Number(count.count) }; }
}

class SqliteLicenseProofRepository implements P.LicenseProofRepository {
  constructor(private readonly db: Kysely<Database>) {}
  async createDraft(input: P.CreateLicenseProofInput): Promise<LicenseProof> {
    const proof = S.validate(S.proofSchema, { ...input, urlAuthorityStatus: 'pending', capturedAt: null, pageSummary: null, screenshotSha256: null, reviewerId: null, reviewedAt: null, conflictFlag: false, verificationStatus: 'pending', previewAssetLicenseSummary: M.derivePreviewSummary([]) });
    const now = S.validate(S.timestampSchema, input.now);
    return atomic(this.db, async db => {
      const version = required(await db.selectFrom('template_versions').selectAll().where('version_id', '=', proof.versionId).executeTakeFirst(), 'Version not found.');
      if (version.immutable || version.submitted_at) throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Submitted versions are immutable.');
      await db.insertInto('license_proofs').values({ id: proof.id, template_id: proof.templateId, version_id: proof.versionId, declaration_version: proof.declarationVersion, declaration_items_json: encode(proof.declarationItems), signer_json: encode(proof.signer), sign_date: proof.signDate, proof_files_json: encode(proof.proofFiles), proof_link: proof.proofLink, revision: 1, file_review_status: 'pending', url_authority_status: 'pending', captured_at: null, page_summary: null, screenshot_sha256: null, reviewer_id: null, reviewed_at: null, conflict_flag: 0, verification_status: 'pending', created_at: now, updated_at: now }).execute(); return required(await new SqliteLicenseProofRepository(db).findByVersion(proof.versionId), 'Proof not found.');
    });
  }
  async findByVersion(versionId: string): Promise<LicenseProof | null> {
    const row = await this.db.selectFrom('license_proofs').selectAll().where('version_id', '=', versionId).executeTakeFirst();
    if (!row) return null;
    const previews = (await this.db.selectFrom('preview_assets').selectAll().where('version_id', '=', versionId).orderBy('id').execute()).map(M.mapPreview);
    return M.mapProof(row, M.derivePreviewSummary(previews));
  }
  async updateDraft(id: string, input: P.UpdateLicenseProofInput): Promise<LicenseProof> {
    const patch = S.validate(S.proofSchema.pick({ proofFiles: true, proofLink: true }).partial().strict(), input);
    return atomic(this.db, async db => {
      const old = required(await db.selectFrom('license_proofs').selectAll().where('id', '=', id).executeTakeFirst(), 'Proof not found.');
      const version = required(await db.selectFrom('template_versions').selectAll().where('version_id', '=', old.version_id).executeTakeFirst(), 'Version not found.');
      if (version.immutable || version.submitted_at || old.verification_status !== 'pending') throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Proof is not editable.');
      const values: Patch<'license_proofs'> = { updated_at: nowUtc() };
      if (patch.proofFiles !== undefined) values.proof_files_json = encode(patch.proofFiles);
      if (patch.proofLink !== undefined) values.proof_link = patch.proofLink;
      await db.updateTable('license_proofs').set(values).where('id', '=', id).execute();
      return M.mapProof(await db.selectFrom('license_proofs').selectAll().where('id', '=', id).executeTakeFirstOrThrow(), M.derivePreviewSummary((await db.selectFrom('preview_assets').selectAll().where('version_id', '=', old.version_id).execute()).map(M.mapPreview)));
    });
  }
}

class SqlitePreviewAssetRepository implements P.PreviewAssetRepository {
  constructor(private readonly db: Kysely<Database>) {}
  async create(input: P.CreatePreviewAssetInput): Promise<PreviewAsset> {
    const p = S.validate(S.previewSchema, { ...input, createdAt: input.now, licenseStatus: 'manual_review', proofRef: null, reviewerId: null, reviewedAt: null, reviewNotes: null });
    return atomic(this.db, async db => { await db.insertInto('preview_assets').values({ id: p.id, template_id: p.templateId, version_id: p.versionId, kind: p.kind, revision: 1, storage_key: p.storageKey, url: p.url, sha256: p.sha256, mime_type: p.mimeType, size_bytes: p.sizeBytes, license_name: p.licenseName, license_source: p.licenseSource, license_source_url: p.licenseSourceUrl, license_status: p.licenseStatus, proof_ref: null, reviewer_id: null, reviewed_at: null, created_at: p.createdAt }).execute(); return M.mapPreview(await db.selectFrom('preview_assets').selectAll().where('id', '=', p.id).executeTakeFirstOrThrow()); });
  }
  async listByVersion(versionId: string): Promise<PreviewAsset[]> { return (await this.db.selectFrom('preview_assets').selectAll().where('version_id', '=', versionId).orderBy('id').execute()).map(M.mapPreview); }
}

export function createSqliteRepositories(db: Kysely<Database>): P.TransactionRepositories {
  return { users: new SqliteUserRepository(db), sessions: new SqliteSessionRepository(db), products: new SqliteTemplateProductRepository(db), versions: new SqliteTemplateVersionRepository(db), proofs: new SqliteLicenseProofRepository(db), previews: new SqlitePreviewAssetRepository(db), policies: new SqliteRefundPolicyRepository(db), orders: new SqliteOrderRepository(db), entitlements: new SqliteEntitlementRepository(db), complaints: new SqliteComplaintRepository(db), audit: new SqliteAuditLogRepository(db) };
}
export function createSqliteUnitOfWork(db: Kysely<Database>): P.UnitOfWork {
  return { execute: work => atomic(db, trx => work(createSqliteRepositories(trx))) };
}
