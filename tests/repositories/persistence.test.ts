import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql, type Kysely } from 'kysely';
import { createDb } from '../../apps/api/src/db/client.js';
import { migrate } from '../../apps/api/src/db/cli.js';
import type { Database } from '../../apps/api/src/db/types.js';
import { createSqliteRepositories } from '../../apps/api/src/repositories/sqlite/index.js';
import type { TransactionRepositories, CreateSingleItemOrderInput } from '../../apps/api/src/repositories/ports/index.js';
import { assertCanDownload } from '../../apps/api/src/domain/entitlements/download-guard.js';
import { CreateComplaintUseCase } from '../../apps/api/src/application/complaints/create-complaint.js';

const now = '2026-10-01T00:00:00.000Z';
let folder: string;
let db: Kysely<Database>;
let repos: TransactionRepositories;

beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'motion-m0-'));
  db = createDb(join(folder, 'db.sqlite'));
  await migrate(db);
  repos = createSqliteRepositories(db);
  for (const [id, role] of [['buyer', 'buyer'], ['seller', 'seller']] as const) await repos.users.create({ id, email: `${id}@example.com`, passwordHash: 'unused-test-hash', displayName: id, roles: [role], now });
  await repos.products.createDraft({ id: 'tpl', sellerId: 'seller', name: { zh: '模板', en: 'Template' }, summary: { zh: '摘要', en: 'Summary' }, category: 'intro', licenseTypes: ['commercial_single_project'], licensePricing: [{ licenseType: 'commercial_single_project', factor: '1', priceUsdCents: 1000 }], priceUsdCents: 1000, version: '1.0.0', now });
  await repos.versions.createDraft({ versionId: 'ver', templateId: 'tpl', version: '1.0.0', files: [], packageLicense: { parserStatus: 'unknown', file: null, detected: null, excerpt: null }, licenseText: null, now });
});
afterEach(async () => { await db.destroy(); rmSync(folder, { recursive: true, force: true }); });
const orderInput = (): CreateSingleItemOrderInput => ({ id: 'order', orderNo: 'M0-ORDER', buyerId: 'buyer', sellerId: 'seller', templateId: 'tpl', versionId: 'ver', licenseType: 'commercial_single_project', licensePriceFactor: '1', priceCents: 1000, paymentCurrency: 'USD', paymentAmountMinor: 1000, quoteRate: null, quoteExpiresAt: null, platformFeeCents: 100, sellerAmountCents: 900, taxSnapshot: { calculationStatus: 'not_calculated' }, idempotencyKey: 'order-key', now });

async function paidOrder() {
  await repos.orders.createSingleItemPendingPayment(orderInput());
  // Arrange a paid record directly; M0 has no payment execution API or adapter.
  await db.updateTable('orders').set({ payment_status: 'paid', order_status: 'fulfilled', paid_at: now }).where('id', '=', 'order').execute();
  return (await repos.orders.findById('order'))!;
}

describe('M0 real SQLite persistence', () => {
  it('runs migrations idempotently with WAL, one CSRF column and no parser duplication', async () => {
    await migrate(db);
    expect((await sql<{ journal_mode: string }>`PRAGMA journal_mode`.execute(db)).rows[0]?.journal_mode).toBe('wal');
    const versions = (await sql<{ name: string }>`PRAGMA table_info(template_versions)`.execute(db)).rows.map(column => column.name);
    expect(versions).toContain('package_license_json');
    expect(versions).not.toContain('parser_status');
    expect(versions).not.toContain('files_json');
    const sessions = (await sql<{ name: string }>`PRAGMA table_info(auth_sessions)`.execute(db)).rows.map(column => column.name);
    expect(sessions).toContain('csrf_token_hash');
    expect(await sql`SELECT name FROM sqlite_master WHERE name='session_csrf_tokens'`.execute(db)).toMatchObject({ rows: [] });
    expect((await repos.policies.getCurrent()).version).toBe('v2.1');
    expect(await repos.policies.findByVersion('v2.0')).toBeNull();
  });

  it('prevents multiple active policies and rolls back a failed createVersion', async () => {
    const current = await repos.policies.getCurrent();
    const { isActive: _isActive, ...input } = current;
    await expect(repos.policies.createVersion(input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await repos.policies.getCurrent()).version).toBe('v2.1');
    const original = await db.selectFrom('refund_policies').selectAll().where('is_active', '=', 1).executeTakeFirstOrThrow();
    await expect(db.insertInto('refund_policies').values({ ...original, id: 'second-policy', version: 'v2.2' }).execute()).rejects.toBeDefined();
    await expect(db.updateTable('refund_policies').set({ is_active: 3 }).where('id', '=', current.id).execute()).rejects.toBeDefined();
    await expect(db.updateTable('refund_policies').set({ window_days: 14 }).where('id', '=', current.id).execute()).rejects.toBeDefined();
  });

  it('snapshots all five policy fields and preserves the order when policy changes', async () => {
    const created = await repos.orders.createSingleItemPendingPayment(orderInput());
    expect(created.refundPolicyVersion).toBe('v2.1');
    expect(created.refundPolicySnapshot).toEqual({ windowDays: 7, eligible: ['file_corrupted_or_inaccessible', 'materially_not_as_described', 'duplicate_purchase'], exclusions: ['already_downloaded', 'subjective_dissatisfaction'], windowExemptReasons: ['technical_unavailable', 'file_corrupted_or_inaccessible'], manualReviewRequired: true });
    expect(created.items).toHaveLength(1);
    expect(created.items[0]).toMatchObject({ templateId: created.templateId, versionId: created.versionId, licenseType: created.licenseType, priceCents: created.priceCents });
    const { isActive: _isActive, ...current } = await repos.policies.getCurrent();
    await repos.policies.createVersion({ ...current, id: 'next-policy', version: 'v2.2', windowDays: 3 });
    expect((await repos.policies.getCurrent()).version).toBe('v2.2');
    expect((await repos.orders.findById(created.id))?.refundPolicySnapshot.windowDays).toBe(7);
    const original = await db.selectFrom('order_items').selectAll().where('order_id', '=', created.id).executeTakeFirstOrThrow();
    await expect(db.insertInto('order_items').values(original).execute()).rejects.toBeDefined();
    await expect(repos.orders.createSingleItemPendingPayment({ ...orderInput(), priceCents: 1100, paymentAmountMinor: 1100, sellerAmountCents: 1000 })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('rejects fractional cents, invalid times, and removed restoration without mutation', async () => {
    await expect(repos.orders.createSingleItemPendingPayment({ ...orderInput(), priceCents: 1000.5 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(repos.orders.createSingleItemPendingPayment({ ...orderInput(), now: '2026-10-01T00:00:00' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await repos.products.transitionStatus('tpl', 'draft', 'removed', 'Seller withdrew this unpublished listing.', 'seller');
    await expect(repos.products.transitionStatus('tpl', 'removed', 'approved', 'Trying to restore removed listing.', 'seller')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await repos.products.findById('tpl'))?.status).toBe('removed');
    const audit = await repos.audit.listByTarget('template', 'tpl', { limit: 20, offset: 0 });
    expect(audit.items[0]?.diff).toContainEqual({ field: 'status', before: 'draft', after: 'removed' });
    await expect(db.deleteFrom('audit_logs').execute()).rejects.toBeDefined();
  });

  it('keeps reissued entries visible but rejects download eligibility', async () => {
    await paidOrder();
    const common = { order_id: 'order', template_id: 'tpl', version_id: 'ver', license_type: 'commercial_single_project', max_downloads: 10, expires_at: '2027-10-01T00:00:00.000Z', revoke_reason_public: null, revoke_reason_internal: null, last_downloaded_at: null, created_at: now, updated_at: now };
    await db.insertInto('entitlements').values({ ...common, id: 'old', download_count: 4, status: 'reissued', reissued_from_id: null, reissued_to_id: 'new' }).execute();
    await db.insertInto('entitlements').values({ ...common, id: 'new', download_count: 0, status: 'active', reissued_from_id: 'old', reissued_to_id: null }).execute();
    const result = await repos.entitlements.listByBuyer('buyer', { limit: 20, offset: 0 });
    expect(result.total).toBe(2);
    const old = result.items.find(entry => entry.id === 'old')!;
    expect(old.status).toBe('reissued');
    expect(() => assertCanDownload(old, '2026-10-02T00:00:00.000Z')).toThrowError(/reissued/);
    await expect(db.updateTable('entitlements').set({ reissued_to_id: 'old' }).where('id', '=', 'old').execute()).rejects.toBeDefined();
  });

  it('persists application-routed technical complaints and normalized timeline only', async () => {
    await paidOrder();
    const useCase = new CreateComplaintUseCase({ orders: repos.orders, complaints: repos.complaints });
    const complaint = await useCase.execute({ buyerId: 'buyer', orderId: 'order', reason: 'file_corrupted_or_inaccessible', description: 'File cannot be accessed.', now: '2026-12-01T00:00:00.000Z' });
    expect(complaint.status).toBe('submitted');
    expect(complaint.reviewRoute).toBe('manual_review');
    expect(complaint.timeline).toHaveLength(1);
    expect(complaint.timeline[0]?.actorId).toBe('buyer');
    await expect(useCase.execute({ buyerId: 'buyer', orderId: 'order', reason: 'duplicate_purchase', description: 'Duplicate purchase.', now: '2026-12-01T00:00:00.000Z' })).rejects.toMatchObject({ code: 'REFUND_WINDOW_EXPIRED' });
    expect((await db.selectFrom('complaints').selectAll().execute())).toHaveLength(1);
    const columns = (await sql<{ name: string }>`PRAGMA table_info(complaints)`.execute(db)).rows.map(value => value.name);
    expect(columns).not.toContain('timeline_json');
  });
});
