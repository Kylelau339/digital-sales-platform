import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../apps/api/src/db/types.js';
import { createDb } from '../apps/api/src/db/client.js';
import { migrate } from '../apps/api/src/db/cli.js';
import { createApp } from '../apps/api/src/app.js';
import { loadEnv } from '../apps/api/src/config/env.js';
import { MemoryVerificationSender } from '../apps/api/src/auth/email-verification.js';
import { connectWebhookSignature, type ConnectClient } from '../apps/api/src/connect/service.js';

const origin = 'http://localhost:5173';
const config = loadEnv({ NODE_ENV: 'test', ALLOWED_ORIGIN: origin, STRIPE_CONNECT_WEBHOOK_SECRET: 'connect-secret' });
let db: Kysely<Database>; let app: FastifyInstance; let sender: MemoryVerificationSender;
const account = { id: 'acct_test_1', livemode: false, capabilities: { stripe_transfers: { status: 'active' } }, requirements: {} };
const client: ConnectClient = { async createAccount() { return account; }, async createAccountLink() { return { url: 'https://connect.stripe.test/onboard' }; }, async retrieveAccount() { return account; } };
const webhookHeaders = { 'content-type': 'application/json', 'stripe-signature': 'bad', 'stripe-timestamp': '1' };

beforeEach(async () => { db = createDb(':memory:'); await migrate(db); sender = new MemoryVerificationSender(); app = createApp(db, config, { verificationSender: sender, connectClient: client }); await app.ready(); });
afterEach(async () => { await app.close(); await db.destroy(); });
async function register() { const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin }, payload: { email: 'seller@example.com', password: 'Test-Password-123', displayName: 'Seller' } }); const cookie = response.cookies.find(item => item.name === 'motion_session')!; return { cookie: `motion_session=${encodeURIComponent(cookie.value)}`, csrf: response.json().csrfToken, userId: response.json().user.id }; }
async function verifySeller(session?: { cookie: string; csrf: string; userId: string }) { const actual = session ?? await register(); await db.updateTable('users').set({ roles_json: '["seller"]', auth_status: 'verified', email_verified_at: new Date().toISOString() }).where('id', '=', actual.userId).execute(); const headers = { origin, cookie: actual.cookie, 'x-csrf-token': actual.csrf }; return { ...actual, headers }; }

describe('Connect Accounts v2 onboarding', () => {
  it('requires verified seller, creates account idempotently and returns onboarding link', async () => {
    const session = await register();
    const denied = await app.inject({ method: 'POST', url: '/api/v1/seller/connect/account', headers: { origin, cookie: session.cookie, 'x-csrf-token': session.csrf }, payload: { idempotencyKey: 'seller-intent-1' } });
    expect(denied.statusCode).toBe(403);
    await db.updateTable('users').set({ roles_json: '["seller"]', auth_status: 'verified', email_verified_at: new Date().toISOString() }).where('id', '=', session.userId).execute();
    const verified = { ...session, headers: { origin, cookie: session.cookie, 'x-csrf-token': session.csrf } };
    const first = await app.inject({ method: 'POST', url: '/api/v1/seller/connect/account', headers: verified.headers, payload: { idempotencyKey: 'seller-intent-1' } });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: 'POST', url: '/api/v1/seller/connect/account', headers: verified.headers, payload: { idempotencyKey: 'seller-intent-1' } });
    expect(second.statusCode).toBe(200);
    expect(second.json().stripe_account_id).toBe('acct_test_1');
    const link = await app.inject({ method: 'POST', url: '/api/v1/seller/connect/onboarding-link', headers: verified.headers, payload: {} });
    expect(link.statusCode).toBe(200);
    expect(link.json().url).toContain('connect.stripe.test');
  });
  it('rejects bad signatures and ignores duplicate webhook events', async () => {
    const verified = await verifySeller();
    await app.inject({ method: 'POST', url: '/api/v1/seller/connect/account', headers: verified.headers, payload: { idempotencyKey: 'seller-intent-2' } });
    const payload = JSON.stringify({ id: 'evt_connect_1', type: 'v2.core.account[requirements].updated', data: { object: { id: 'acct_test_1' } } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const bad = await app.inject({ method: 'POST', url: '/api/v1/webhooks/stripe/connect', headers: { 'content-type': 'application/json', 'stripe-signature': 'bad' }, payload });
    expect(bad.statusCode).toBe(400);
    const signature = connectWebhookSignature(payload, 'connect-secret', timestamp);
    const first = await app.inject({ method: 'POST', url: '/api/v1/webhooks/stripe/connect', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, payload });
    expect(first.statusCode).toBe(200);
    const duplicate = await app.inject({ method: 'POST', url: '/api/v1/webhooks/stripe/connect', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, payload });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().duplicate).toBe(true);
  });
});
