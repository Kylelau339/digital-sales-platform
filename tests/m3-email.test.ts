import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../apps/api/src/db/client.js';
import { migrate } from '../apps/api/src/db/cli.js';
import { createEmailVerification, MemoryVerificationSender } from '../apps/api/src/auth/email-verification.js';
import { createHarness, origin, type Harness } from './helpers/m3';
import type { Kysely } from 'kysely';
import type { Database } from '../apps/api/src/db/types.js';

let h: Harness;
let sender: MemoryVerificationSender;

beforeEach(async () => { sender = new MemoryVerificationSender(); h = await createHarness({ verificationSender: sender }); });
afterEach(async () => { await h.close(); });

describe('M3 transactional email', () => {
  it('delivers a verification code, logs the attempt, and verifies the user', async () => {
    const response = await h.app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin }, payload: { email: 'newbuyer@example.com', password: 'Test-Password-123', displayName: 'New Buyer' } });
    expect(response.statusCode, response.body).toBe(201);
    const body = response.json();
    const cookie = response.cookies.find(item => item.name === 'motion_session')!;
    const messages = await h.db.selectFrom('email_delivery_logs').selectAll().where('user_id', '=', body.user.id).execute();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ status: 'sent', provider: 'memory', kind: 'email_verification', recipient: 'newbuyer@example.com' });
    const message = sender.messages.find(item => item.email === 'newbuyer@example.com');
    expect(message).toBeTruthy();

    const stored = await h.db.selectFrom('email_verification_codes').selectAll().where('user_id', '=', body.user.id).executeTakeFirstOrThrow();
    expect(stored.attempts).toBe(0);
    const verify = await h.app.inject({ method: 'POST', url: '/api/v1/auth/email-verification/verify', headers: { origin, cookie: `motion_session=${encodeURIComponent(cookie.value)}`, 'x-csrf-token': body.csrfToken }, payload: { code: message!.code } });
    expect(verify.statusCode, verify.body).toBe(200);
    const verified = await h.db.selectFrom('users').selectAll().where('id', '=', body.user.id).executeTakeFirstOrThrow();
    expect(verified.auth_status).toBe('verified');
  });

  it('records a failed delivery and consumes the code', async () => {
    const db: Kysely<Database> = createDb(':memory:');
    await migrate(db);
    const now = new Date().toISOString();
    await db.insertInto('users').values({ id: 'user_mail', email: 'mail@example.com', password_hash: 'unused', auth_status: 'pending_email', roles_json: '["buyer"]', display_name: 'Mail', email_verified_at: null, created_at: now, updated_at: now }).execute();
    const service = createEmailVerification(db, 'csrf-secret-that-is-long-enough', { provider: 'smtp', async send() { throw new Error('SMTP unavailable'); } });
    await expect(service.send('user_mail')).rejects.toThrow('Email delivery failed');
    const logs = await db.selectFrom('email_delivery_logs').selectAll().where('user_id', '=', 'user_mail').execute();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ status: 'failed', provider: 'smtp', error_code: 'Error' });
    const codes = await db.selectFrom('email_verification_codes').selectAll().where('user_id', '=', 'user_mail').execute();
    expect(codes).toHaveLength(1);
    expect(codes[0]!.consumed_at).not.toBeNull();
    await db.destroy();
  });
});
