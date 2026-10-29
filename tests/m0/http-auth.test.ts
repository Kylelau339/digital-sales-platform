import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../apps/api/src/db/types.js';
import { createDb } from '../../apps/api/src/db/client.js';
import { migrate } from '../../apps/api/src/db/cli.js';
import { createApp } from '../../apps/api/src/app.js';
import { loadEnv } from '../../apps/api/src/config/env.js';
import { createSqliteRepositories } from '../../apps/api/src/repositories/sqlite/index.js';
import { MemoryVerificationSender } from '../../apps/api/src/auth/email-verification.js';

const origin = 'http://localhost:5173';
const config = loadEnv({ NODE_ENV: 'test', ALLOWED_ORIGIN: origin });
let db: Kysely<Database>;
let app: FastifyInstance;

beforeEach(async () => { db = createDb(':memory:'); await migrate(db); app = createApp(db, config); await app.ready(); });
afterEach(async () => { await app.close(); await db.destroy(); });

async function register() {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin }, payload: { email: 'buyer@example.com', password: 'Test-Password-123', displayName: 'Test buyer' } });
  expect(response.statusCode).toBe(201);
  const sessionCookie = response.cookies.find(value => value.name === 'motion_session');
  expect(sessionCookie).toBeDefined();
  return { cookie: `motion_session=${encodeURIComponent(sessionCookie!.value)}`, body: response.json() as { user: { id: string; roles: string[]; authStatus: string }; csrfToken: string } };
}

describe('M0 HTTP authentication and CSRF', () => {
  it('registers a buyer, hides password/hash, and restores signed session', async () => {
    const { cookie, body } = await register();
    expect(body.user.roles).toEqual(['buyer']);
    expect(body.user.authStatus).toBe('pending_email');
    expect(body).not.toHaveProperty('passwordHash');
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().user.id).toBe(body.user.id);
    expect(response.body).not.toContain('passwordHash');
    expect(response.body).not.toContain('csrfTokenHash');
  });

  it('invalidates old sessions when an account is locked', async () => {
    const { cookie, body } = await register();
    await createSqliteRepositories(db).users.updateAuthStatus(body.user.id, 'locked');
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } })).statusCode).toBe(401);
  });

  it('supports one-time email verification with a mocked sender', async () => {
    const sender = new MemoryVerificationSender();
    await app.close();
    app = createApp(db, config, { verificationSender: sender }); await app.ready();
    const registered = await register();
    expect(sender.messages).toHaveLength(1);
    const headers = { origin, cookie: registered.cookie, 'x-csrf-token': registered.body.csrfToken };
    const verified = await app.inject({ method: 'POST', url: '/api/v1/auth/email-verification/verify', headers, payload: { code: sender.messages[0]!.code } });
    expect(verified.statusCode).toBe(200);
    expect(verified.json().user.authStatus).toBe('verified');
    const replay = await app.inject({ method: 'POST', url: '/api/v1/auth/email-verification/verify', headers, payload: { code: sender.messages[0]!.code } });
    expect(replay.statusCode).toBe(422);
  });
  it('rejects missing and foreign origins even on anonymous auth writes', async () => {
    for (const headers of [{}, { origin: 'https://attacker.example' }]) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers, payload: { email: 'buyer@example.com', password: 'Test-Password-123' } });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('CSRF_INVALID');
      expect(response.json().requestId).toBeTruthy();
    }
  });

  it('requires CSRF for session writes and rotates one token per session', async () => {
    const { cookie, body } = await register();
    const missing = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { origin, cookie } });
    expect(missing.json().code).toBe('CSRF_INVALID');
    const rotated = await app.inject({ method: 'POST', url: '/api/v1/auth/csrf', headers: { origin, cookie, 'x-csrf-token': body.csrfToken } });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json().csrfToken).not.toBe(body.csrfToken);
    const stale = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { origin, cookie, 'x-csrf-token': body.csrfToken } });
    expect(stale.json().code).toBe('CSRF_INVALID');
    const valid = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { origin, cookie, 'x-csrf-token': rotated.json().csrfToken } });
    expect(valid.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } })).statusCode).toBe(401);
  });

  it('enforces CSRF for admin sessions without a role bypass', async () => {
    const { cookie, body } = await register();
    await createSqliteRepositories(db).users.addRole(body.user.id, 'admin');
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/csrf', headers: { cookie, origin } });
    expect(response.json().code).toBe('CSRF_INVALID');
  });

  it('rejects cross-site reads of session CSRF token', async () => {
    const { cookie } = await register();
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/csrf', headers: { cookie, 'sec-fetch-site': 'cross-site' } });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('CSRF_INVALID');
  });

  it('rejects altered cookies and validates credentials without exposing internals', async () => {
    const { cookie } = await register();
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: `${cookie}tampered` } })).statusCode).toBe(401);
    const invalid = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { email: 'buyer@example.com', password: 'wrong-password' } });
    expect(invalid.statusCode).toBe(401);
    const malformed = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: {} });
    expect(malformed.statusCode).toBe(422);
    expect(malformed.json().code).toBe('VALIDATION_FAILED');
  });

  it('serves health, empty market and current policy without live state values', async () => {
    for (const url of ['/health', '/api/v1/templates', '/api/v1/refund-policy']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toMatch(/"(?:status|state)"\s*:\s*"live"/);
    }
    const policy = (await app.inject({ method: 'GET', url: '/api/v1/refund-policy' })).json();
    expect(policy.version).toBe('v2.1');
    expect(policy.windowDays).toBe(7);
    expect(policy.windowExemptReasons).toEqual(['technical_unavailable', 'file_corrupted_or_inaccessible']);
    expect((await app.inject({ method: 'POST', url: '/api/v1/payments/stripe/webhook', headers: { origin } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/v1/templates/x/finalize', headers: { origin } })).statusCode).toBe(404);
  });
});
