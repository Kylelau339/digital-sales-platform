import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import yauzl from 'yauzl';
import yazl from 'yazl';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../apps/api/src/db/types.js';
import { createDb } from '../apps/api/src/db/client.js';
import { migrate } from '../apps/api/src/db/cli.js';
import { createApp } from '../apps/api/src/app.js';
import { loadEnv } from '../apps/api/src/config/env.js';
import { LocalPrivateStorage } from '../apps/api/src/storage/local-private-storage.js';

const origin = 'http://localhost:5173';
const now = '2026-10-29T00:00:00.000Z';
const artifact = Buffer.from('download test artifact');
const sanitizedZip = (): Promise<Buffer> => new Promise((resolve, reject) => {
  const zip = new yazl.ZipFile(); const output = new PassThrough(); const chunks: Buffer[] = [];
  output.on('data', chunk => chunks.push(Buffer.from(chunk))).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject);
  zip.outputStream.pipe(output); zip.addBuffer(Buffer.from(JSON.stringify({ name: 'demo', api_key: '[REDACTED_BY_PLATFORM]' })), 'motion.json'); zip.addBuffer(Buffer.from('license'), 'TEMPLATE-LICENSE.txt'); zip.end();
});
const readZipEntry = (buffer: Buffer, name: string): Promise<Buffer> => new Promise((resolve, reject) => {
  yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
    if (error || !zip) return reject(error ?? new Error('zip open failed'));
    zip.on('entry', entry => { if (entry.fileName !== name) return zip.readEntry(); zip.openReadStream(entry, (streamError, stream) => { if (streamError || !stream) return reject(streamError ?? new Error('zip stream failed')); const chunks: Buffer[] = []; stream.on('data', chunk => chunks.push(Buffer.from(chunk))).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject); }); }); zip.on('error', reject); zip.readEntry();
  });
});
const snapshot = { windowDays: 7, eligible: ['file_corrupted_or_inaccessible', 'materially_not_as_described', 'duplicate_purchase'], exclusions: ['already_downloaded', 'subjective_dissatisfaction'], windowExemptReasons: ['technical_unavailable', 'file_corrupted_or_inaccessible'], manualReviewRequired: true };
let db: Kysely<Database>; let app: FastifyInstance; let folder: string; let cookie: string; let csrf: string; let buyerId: string;

beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'motion-download-'));
  db = createDb(':memory:'); await migrate(db);
  await db.insertInto('users').values({ id: 'seller', email: 'seller@example.com', password_hash: 'unused', auth_status: 'verified', roles_json: '["seller"]', display_name: 'Seller', email_verified_at: now, created_at: now, updated_at: now }).execute();
  app = createApp(db, loadEnv({ NODE_ENV: 'test', ALLOWED_ORIGIN: origin, PRIVATE_STORAGE_PATH: folder, CSRF_SECRET: 'test-secret-for-download-hmac-123' }), { clock: () => new Date(now) }); await app.ready();
  const registered = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin }, payload: { email: 'buyer@example.com', password: 'Test-Password-123', displayName: 'Buyer' } });
  buyerId = registered.json().user.id; csrf = registered.json().csrfToken;
  const signed = registered.cookies.find(item => item.name === 'motion_session')!; cookie = `motion_session=${encodeURIComponent(signed.value)}`;
  await db.updateTable('users').set({ auth_status: 'verified', email_verified_at: now }).where('id', '=', buyerId).execute();
  await db.insertInto('users').values({ id: 'buyer-other', email: 'other@example.com', password_hash: 'unused', auth_status: 'verified', roles_json: '["buyer"]', display_name: 'Other', email_verified_at: now, created_at: now, updated_at: now }).execute();
  await db.insertInto('template_products').values({ id: 'tpl', seller_id: 'seller', name_json: '{"zh":"模板","en":"Template"}', summary_json: '{"zh":"摘要","en":"Summary"}', category: 'intro', tags_json: '[]', license_types_json: '["personal_use"]', license_pricing_json: '[]', price_usd_cents: 1000, status: 'approved', published_at: now, current_version_id: 'ver', review_target_version_id: null, version: '1.0.0', rating: 0, rating_count: 0, sales_recent_json: '0', early_signal_json: '{}', ranking_updated_at: null, updated_at: now, created_at: now }).execute();
  await db.insertInto('template_versions').values({ version_id: 'ver', template_id: 'tpl', version: '1.0.0', status: 'approved', revision: 1, package_license_json: '{"parserStatus":"parsed"}', license_text: null, scan_job_id: 'scan', scan_status: 'passed', conflict_flag: 0, conflict_reasons_json: '[]', immutable: 1, created_at: now, submitted_at: now, approved_at: now }).execute();
  const artifact = await sanitizedZip();
  const storage = new LocalPrivateStorage(folder); const stored = await storage.put('templates/tpl/ver/package.zip', artifact);
  await db.insertInto('template_files').values({ file_id: 'file', version_id: 'ver', kind: 'motion_package', storage_key: stored.storageKey, filename: 'package.zip', mime_type: 'application/zip', size_bytes: stored.sizeBytes, sha256: stored.sha256, artifact_status: 'sanitized' }).execute();
  await db.insertInto('orders').values([
    { id: 'order', order_no: 'order-no', buyer_id: buyerId, seller_id: 'seller', template_id: 'tpl', version_id: 'ver', license_type: 'personal_use', license_price_factor: '1', price_cents: 1000, pricing_currency: 'USD', payment_currency: 'USD', payment_amount_minor: 1000, quote_rate_json: null, quote_expires_at: null, quote_id: null, refund_policy_version: 'v2.1', refund_policy_snapshot_json: JSON.stringify(snapshot), platform_fee_cents: 0, seller_amount_cents: 1000, tax_snapshot_json: '{}', payment_status: 'paid', order_status: 'fulfilled', paid_at: now, idempotency_key: 'order-key', stripe_checkout_session_id: null, checkout_session_expires_at: null, created_at: now, updated_at: now },
    { id: 'order-other', order_no: 'order-no-other', buyer_id: 'buyer-other', seller_id: 'seller', template_id: 'tpl', version_id: 'ver', license_type: 'personal_use', license_price_factor: '1', price_cents: 1000, pricing_currency: 'USD', payment_currency: 'USD', payment_amount_minor: 1000, quote_rate_json: null, quote_expires_at: null, quote_id: null, refund_policy_version: 'v2.1', refund_policy_snapshot_json: JSON.stringify(snapshot), platform_fee_cents: 0, seller_amount_cents: 1000, tax_snapshot_json: '{}', payment_status: 'paid', order_status: 'fulfilled', paid_at: now, idempotency_key: 'order-key-other', stripe_checkout_session_id: null, checkout_session_expires_at: null, created_at: now, updated_at: now }
  ]).execute();
  await db.insertInto('entitlements').values([
    { id: 'ent', order_id: 'order', template_id: 'tpl', version_id: 'ver', license_type: 'personal_use', max_downloads: 10, download_count: 0, expires_at: '2027-10-29T00:00:00.000Z', status: 'active', reissued_from_id: null, reissued_to_id: null, revoke_reason_public: null, revoke_reason_internal: null, last_downloaded_at: null, created_at: now, updated_at: now },
    { id: 'ent-other', order_id: 'order-other', template_id: 'tpl', version_id: 'ver', license_type: 'personal_use', max_downloads: 10, download_count: 0, expires_at: '2027-10-29T00:00:00.000Z', status: 'active', reissued_from_id: null, reissued_to_id: null, revoke_reason_public: null, revoke_reason_internal: null, last_downloaded_at: null, created_at: now, updated_at: now }
  ]).execute();
});

afterEach(async () => { if (app) await app.close(); await db.destroy(); rmSync(folder, { recursive: true, force: true }); });
const headers = () => ({ origin, cookie, 'x-csrf-token': csrf });

describe('reservation-based downloads', () => {
  it('lists only the authenticated buyer entitlements and requires authentication', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/entitlements' })).statusCode).toBe(401);
    const response = await app.inject({ method: 'GET', url: '/api/v1/entitlements?limit=1&offset=0', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 1, items: [{ id: 'ent', templateId: 'tpl' }], limit: 1, offset: 0 });
  });
  it('reserves idempotently, consumes once, and streams verified bytes', async () => {
    const create = (key: string) => app.inject({ method: 'POST', url: '/api/v1/entitlements/ent/downloads', headers: { ...headers(), 'idempotency-key': key }, payload: {} });
    const first = await create('download-key-1'); expect(first.statusCode).toBe(200);
    const again = await create('download-key-1'); expect(again.json().downloadUrl).toBe(first.json().downloadUrl);
    const delivered = await app.inject({ method: 'GET', url: first.json().downloadUrl });
    expect(delivered.statusCode).toBe(200);
    const responseZip = Buffer.from(delivered.rawPayload);
    expect(responseZip.subarray(0, 4).toString('hex')).toBe('504b0304');
    const motion = JSON.parse((await readZipEntry(responseZip, 'motion.json')).toString('utf8'));
    expect(motion.api_key).toBe('[REDACTED_BY_PLATFORM]');
    expect(delivered.headers['content-disposition']).toContain('package.zip');
    const replay = await app.inject({ method: 'GET', url: first.json().downloadUrl }); expect(replay.statusCode).toBe(409);
    expect((await db.selectFrom('entitlements').select('download_count').where('id', '=', 'ent').executeTakeFirstOrThrow()).download_count).toBe(1);
  });
  it('prevents access to another buyer entitlement', async () => {
    const foreign = await app.inject({ method: 'POST', url: '/api/v1/entitlements/ent-other/downloads', headers: { ...headers(), 'idempotency-key': 'foreign-key-1' }, payload: {} });
    expect(foreign.statusCode).toBe(404);
  });
  it('allows only ten successful concurrent redemptions from twenty issued tokens', async () => {
    const reservations = await Promise.all(Array.from({ length: 20 }, (_, index) => app.inject({ method: 'POST', url: '/api/v1/entitlements/ent/downloads', headers: { ...headers(), 'idempotency-key': `parallel-key-${index}` }, payload: {} })));
    expect(reservations.every(response => response.statusCode === 200)).toBe(true);
    const urls = reservations.map(response => response.json().downloadUrl as string);
    const redeemed = await Promise.all(urls.map(url => app.inject({ method: 'GET', url })));
    expect(redeemed.filter(response => response.statusCode === 200)).toHaveLength(10);
    expect(redeemed.filter(response => response.statusCode === 409 && response.json().code === 'ENTITLEMENT_EXHAUSTED')).toHaveLength(10);
    expect((await db.selectFrom('entitlements').select('download_count').where('id', '=', 'ent').executeTakeFirstOrThrow()).download_count).toBe(10);
  });
  it('rejects issued tokens after template suspension', async () => {
    const reserved = await app.inject({ method: 'POST', url: '/api/v1/entitlements/ent/downloads', headers: { ...headers(), 'idempotency-key': 'suspend-token-1' }, payload: {} });
    await db.updateTable('template_products').set({ status: 'suspended' }).where('id', '=', 'tpl').execute();
    expect((await app.inject({ method: 'GET', url: reserved.json().downloadUrl })).statusCode).toBe(409);
    expect((await db.selectFrom('entitlements').select('download_count').where('id', '=', 'ent').executeTakeFirstOrThrow()).download_count).toBe(0);
  });
  it('rejects tampered HMAC tokens', async () => {
    const reserved = await app.inject({ method: 'POST', url: '/api/v1/entitlements/ent/downloads', headers: { ...headers(), 'idempotency-key': 'download-key-1' }, payload: {} });
    const url = reserved.json().downloadUrl as string;
    const tampered = `${url.slice(0, -1)}x`;
    expect((await app.inject({ method: 'GET', url: tampered })).statusCode).toBe(404);
  });
});
