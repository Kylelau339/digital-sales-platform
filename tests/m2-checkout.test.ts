import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../apps/api/src/db/types.js';
import { createDb } from '../apps/api/src/db/client.js';
import { migrate } from '../apps/api/src/db/cli.js';
import { createApp } from '../apps/api/src/app.js';
import { loadEnv } from '../apps/api/src/config/env.js';
import { LocalPrivateStorage } from '../apps/api/src/storage/local-private-storage.js';
import type { CheckoutClient } from '../apps/api/src/payments/service.js';

const origin = 'http://localhost:5173';
let db: Kysely<Database>;
let app: FastifyInstance;
let folder: string;
let checkoutCalls: Array<Record<string, unknown>>;
let webhookEvent: unknown;

const artifact = Buffer.from('sanitized motion package');
const now = '2026-10-29T00:00:00.000Z';

beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'motion-checkout-'));
  db = createDb(':memory:');
  await migrate(db);
  const storage = new LocalPrivateStorage(folder);
  const stored = await storage.put('templates/tpl/ver/package-sanitized.zip', artifact);
  await db.insertInto('users').values({ id: 'seller', email: 'seller@example.com', password_hash: 'unused', auth_status: 'verified', roles_json: '["seller"]', display_name: 'Seller', email_verified_at: now, created_at: now, updated_at: now }).execute();
  await db.insertInto('template_products').values({ id: 'tpl', seller_id: 'seller', name_json: '{"zh":"模板","en":"Template"}', summary_json: '{"zh":"摘要","en":"Summary"}', category: 'intro', tags_json: '[]', license_types_json: '["commercial_single_project","personal_use"]', license_pricing_json: '[{"licenseType":"commercial_single_project","factor":"1","priceUsdCents":2500},{"licenseType":"personal_use","factor":"0.5","priceUsdCents":1250}]', price_usd_cents: 1000, status: 'approved', published_at: now, current_version_id: 'ver', review_target_version_id: null, version: '1.0.0', rating: 0, rating_count: 0, sales_recent_json: '0', early_signal_json: '{}', ranking_updated_at: null, updated_at: now, created_at: now }).execute();
  await db.insertInto('template_versions').values({ version_id: 'ver', template_id: 'tpl', version: '1.0.0', status: 'approved', revision: 1, package_license_json: '{"parserStatus":"parsed","file":null,"detected":null,"excerpt":null}', license_text: null, scan_job_id: 'scan', scan_status: 'passed', conflict_flag: 0, conflict_reasons_json: '[]', immutable: 1, created_at: now, submitted_at: now, approved_at: now }).execute();
  await db.insertInto('template_files').values({ file_id: 'file', version_id: 'ver', kind: 'motion_package', storage_key: stored.storageKey, filename: 'package.zip', mime_type: 'application/zip', size_bytes: stored.sizeBytes, sha256: stored.sha256, artifact_status: 'sanitized' }).execute();
  checkoutCalls = [];
  const checkoutClient: CheckoutClient = {
    async create(input) { checkoutCalls.push(input); return { id: `cs_${checkoutCalls.length}`, url: `https://checkout.test/${checkoutCalls.length}`, expiresAt: '2026-10-29T01:00:00.000Z' }; },
    verify(_rawBody, signature) { if (signature !== 'valid') throw new Error('invalid signature'); return webhookEvent; }
  };
  app = createApp(db, loadEnv({ NODE_ENV: 'test', ALLOWED_ORIGIN: origin, PRIVATE_STORAGE_PATH: folder, STRIPE_WEBHOOK_SECRET: 'whsec_test' }), { checkoutClient });
  await app.ready();
});

afterEach(async () => { if (app) await app.close(); if (db) await db.destroy(); rmSync(folder, { recursive: true, force: true }); });

async function registerBuyer() {
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin }, payload: { email: 'buyer@example.com', password: 'Test-Password-123', displayName: 'Buyer' } });
  const body = response.json();
  const cookie = response.cookies.find(item => item.name === 'motion_session')!;
  return { cookie: `motion_session=${encodeURIComponent(cookie.value)}`, csrf: body.csrfToken, userId: body.user.id };
}

function checkoutHeaders(session: { cookie: string; csrf: string }) { return { origin, cookie: session.cookie, 'x-csrf-token': session.csrf, 'idempotency-key': 'checkout-request-1' }; }

describe('M2 Checkout Sessions', () => {
  it('requires verified email and prices from the approved server-side license', async () => {
    const session = await registerBuyer();
    const denied = await app.inject({ method: 'POST', url: '/api/v1/checkout/sessions', headers: checkoutHeaders(session), payload: { templateId: 'tpl', licenseType: 'commercial_single_project' } });
    expect(denied.statusCode).toBe(403);

    await db.updateTable('users').set({ auth_status: 'verified', email_verified_at: now }).where('id', '=', session.userId).execute();
    const created = await app.inject({ method: 'POST', url: '/api/v1/checkout/sessions', headers: checkoutHeaders(session), payload: { templateId: 'tpl', licenseType: 'commercial_single_project', priceCents: 1 } });
    expect(created.statusCode).toBe(422);

    const response = await app.inject({ method: 'POST', url: '/api/v1/checkout/sessions', headers: checkoutHeaders(session), payload: { templateId: 'tpl', licenseType: 'commercial_single_project' } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ checkoutSessionId: 'cs_1', url: 'https://checkout.test/1' });
    expect(checkoutCalls[0]).toMatchObject({ amountCents: 2500, licenseType: 'commercial_single_project' });
    const order = await db.selectFrom('orders').selectAll().where('id', '=', response.json().orderId).executeTakeFirstOrThrow();
    expect(order.payment_amount_minor).toBe(2500);
    expect(order.stripe_checkout_session_id).toBe('cs_1');
  });

  it('rejects same-key changes and blocks unverified artifacts', async () => {
    const session = await registerBuyer();
    await db.updateTable('users').set({ auth_status: 'verified', email_verified_at: now }).where('id', '=', session.userId).execute();
    const first = await app.inject({ method: 'POST', url: '/api/v1/checkout/sessions', headers: checkoutHeaders(session), payload: { templateId: 'tpl', licenseType: 'commercial_single_project' } });
    expect(first.statusCode).toBe(200);
    const conflict = await app.inject({ method: 'POST', url: '/api/v1/checkout/sessions', headers: checkoutHeaders(session), payload: { templateId: 'tpl', licenseType: 'personal_use' } });
    expect(conflict.statusCode).toBe(409);

    await db.updateTable('template_files').set({ artifact_status: 'unverified' }).execute();
    const unavailable = await app.inject({ method: 'POST', url: '/api/v1/checkout/sessions', headers: { ...checkoutHeaders(session), 'idempotency-key': 'checkout-request-2' }, payload: { templateId: 'tpl', licenseType: 'personal_use' } });
    expect(unavailable.statusCode).toBe(409);
  });

  it('fulfills only verified paid events and treats event replay as a duplicate', async () => {
    const buyer = await registerBuyer();
    await db.updateTable('users').set({ auth_status: 'verified', email_verified_at: now }).where('id', '=', buyer.userId).execute();
    const checkout = await app.inject({ method: 'POST', url: '/api/v1/checkout/sessions', headers: checkoutHeaders(buyer), payload: { templateId: 'tpl', licenseType: 'commercial_single_project' } });
    expect(checkout.statusCode).toBe(200);
    const orderId = checkout.json().orderId as string;
    const session = { id: 'cs_1', livemode: false, mode: 'payment', payment_status: 'paid', amount_subtotal: 2500, amount_total: 2600, currency: 'usd', payment_intent: 'pi_test_1', metadata: { order_id: orderId, template_id: 'tpl', version_id: 'ver', license_type: 'commercial_single_project' }, total_details: { amount_tax: 100 } };
    webhookEvent = { id: 'evt_paid_1', type: 'checkout.session.completed', data: { object: session } };
    const payload = JSON.stringify(webhookEvent);
    const first = await app.inject({ method: 'POST', url: '/api/v1/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': 'valid' }, payload });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ ignored: false, duplicate: false });
    const second = await app.inject({ method: 'POST', url: '/api/v1/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': 'valid' }, payload });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ ignored: true, duplicate: true });
    expect(await db.selectFrom('transactions').selectAll().where('order_id', '=', orderId).execute()).toHaveLength(1);
    expect(await db.selectFrom('entitlements').selectAll().where('order_id', '=', orderId).execute()).toHaveLength(1);
    expect(await db.selectFrom('payment_event_inbox').selectAll().where('event_id', '=', 'evt_paid_1').executeTakeFirst()).toMatchObject({ status: 'processed' });
    expect((await db.selectFrom('orders').select('tax_snapshot_json').where('id', '=', orderId).executeTakeFirstOrThrow()).tax_snapshot_json).toContain('"amountTax":100');
  });

  it('rejects a second payment intent for an already fulfilled order', async () => {
    const buyer = await registerBuyer();
    await db.updateTable('users').set({ auth_status: 'verified', email_verified_at: now }).where('id', '=', buyer.userId).execute();
    const checkout = await app.inject({ method: 'POST', url: '/api/v1/checkout/sessions', headers: checkoutHeaders(buyer), payload: { templateId: 'tpl', licenseType: 'commercial_single_project' } });
    const orderId = checkout.json().orderId as string;
    const session = { id: 'cs_1', livemode: false, mode: 'payment', payment_status: 'paid', amount_subtotal: 2500, amount_total: 2500, currency: 'usd', payment_intent: 'pi_first', metadata: { order_id: orderId, template_id: 'tpl', version_id: 'ver', license_type: 'commercial_single_project' } };
    webhookEvent = { id: 'evt_first_pi', type: 'checkout.session.completed', data: { object: session } };
    const first = await app.inject({ method: 'POST', url: '/api/v1/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': 'valid' }, payload: JSON.stringify(webhookEvent) });
    expect(first.statusCode).toBe(200);
    webhookEvent = { id: 'evt_second_pi', type: 'checkout.session.async_payment_succeeded', data: { object: { ...session, payment_intent: 'pi_second' } } };
    const second = await app.inject({ method: 'POST', url: '/api/v1/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': 'valid' }, payload: JSON.stringify(webhookEvent) });
    expect(second.statusCode).toBe(409);
    expect(await db.selectFrom('transactions').selectAll().where('order_id', '=', orderId).execute()).toHaveLength(1);
    expect(await db.selectFrom('entitlements').selectAll().where('order_id', '=', orderId).execute()).toHaveLength(1);
  });

  it('rejects an invalid webhook signature before inspecting the event', async () => {
    webhookEvent = { id: 'evt_bad_signature', type: 'checkout.session.completed', data: { object: {} } };
    const response = await app.inject({ method: 'POST', url: '/api/v1/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': 'bad' }, payload: '{}' });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('PAYMENT_WEBHOOK_INVALID');
  });

  it('does not fulfill an async event before Stripe marks it paid', async () => {
    const buyer = await registerBuyer();
    await db.updateTable('users').set({ auth_status: 'verified', email_verified_at: now }).where('id', '=', buyer.userId).execute();
    const checkout = await app.inject({ method: 'POST', url: '/api/v1/checkout/sessions', headers: checkoutHeaders(buyer), payload: { templateId: 'tpl', licenseType: 'commercial_single_project' } });
    const orderId = checkout.json().orderId as string;
    webhookEvent = { id: 'evt_async_pending', type: 'checkout.session.async_payment_succeeded', data: { object: { id: 'cs_1', livemode: false, mode: 'payment', payment_status: 'unpaid', amount_subtotal: 2500, amount_total: 2500, currency: 'usd', payment_intent: 'pi_pending', metadata: { order_id: orderId, template_id: 'tpl', version_id: 'ver', license_type: 'commercial_single_project' } } } };
    const response = await app.inject({ method: 'POST', url: '/api/v1/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': 'valid' }, payload: JSON.stringify(webhookEvent) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ignored: true, duplicate: false });
    expect((await db.selectFrom('orders').select('payment_status').where('id', '=', orderId).executeTakeFirstOrThrow()).payment_status).toBe('pending');
  });

  it('rejects webhook amount mismatch without changing the order', async () => {
    const buyer = await registerBuyer();
    await db.updateTable('users').set({ auth_status: 'verified', email_verified_at: now }).where('id', '=', buyer.userId).execute();
    const checkout = await app.inject({ method: 'POST', url: '/api/v1/checkout/sessions', headers: checkoutHeaders(buyer), payload: { templateId: 'tpl', licenseType: 'commercial_single_project' } });
    const orderId = checkout.json().orderId as string;
    webhookEvent = { id: 'evt_wrong_amount', type: 'checkout.session.completed', data: { object: { id: 'cs_1', livemode: false, mode: 'payment', payment_status: 'paid', amount_subtotal: 2500, amount_total: 2501, currency: 'usd', payment_intent: 'pi_wrong', metadata: { order_id: orderId, template_id: 'tpl', version_id: 'ver', license_type: 'commercial_single_project' } } } };
    const response = await app.inject({ method: 'POST', url: '/api/v1/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': 'valid' }, payload: JSON.stringify(webhookEvent) });
    expect(response.statusCode).toBe(409);
    expect((await db.selectFrom('orders').select('payment_status').where('id', '=', orderId).executeTakeFirstOrThrow()).payment_status).toBe('pending');
    expect(await db.selectFrom('entitlements').selectAll().where('order_id', '=', orderId).execute()).toHaveLength(0);
  });
});
