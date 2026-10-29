import { randomInt } from 'node:crypto';
import type { Kysely } from 'kysely';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import { id } from '@shared/time.js';
import type { Database } from '../db/types.js';
import { hashToken, matchesToken } from '../config/tokens.js';

export interface VerificationSender { send(input: { email: string; code: string; expiresAt: string }): Promise<void>; }
export class MemoryVerificationSender implements VerificationSender {
  readonly messages: Array<{ email: string; code: string; expiresAt: string }> = [];
  async send(input: { email: string; code: string; expiresAt: string }): Promise<void> { this.messages.push(input); }
}

export function createEmailVerification(db: Kysely<Database>, secret: string, sender: VerificationSender | undefined, clock: () => Date = () => new Date()) {
  return {
    async send(userId: string): Promise<void> {
      if (!sender) throw new DomainError(ERROR_CODES.INTERNAL_ERROR, 500, 'Email delivery is not configured.');
      const now = clock(); const at = now.toISOString(); const expiresAt = new Date(now.getTime() + 600_000).toISOString();
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const codeId = id('emailcode');
      const email = await db.transaction().execute(async trx => {
        const user = await trx.selectFrom('users').select(['email', 'auth_status']).where('id', '=', userId).executeTakeFirst();
        if (!user || user.auth_status !== 'pending_email') throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Email verification is not available.');
        const recent = await trx.selectFrom('email_verification_codes').select('created_at').where('user_id', '=', userId).where('created_at', '>', new Date(now.getTime() - 60_000).toISOString()).executeTakeFirst();
        if (recent) throw new DomainError(ERROR_CODES.CONFLICT, 429, 'Please wait before requesting another code.');
        await trx.updateTable('email_verification_codes').set({ consumed_at: at }).where('user_id', '=', userId).where('consumed_at', 'is', null).execute();
        await trx.insertInto('email_verification_codes').values({ id: codeId, user_id: userId, code_hash: hashToken(`${userId}:${code}`, secret), created_at: at, expires_at: expiresAt, consumed_at: null, attempts: 0 }).execute();
        return user.email;
      });
      try { await sender.send({ email, code, expiresAt }); }
      catch { await db.updateTable('email_verification_codes').set({ consumed_at: at }).where('id', '=', codeId).where('consumed_at', 'is', null).execute(); throw new DomainError(ERROR_CODES.INTERNAL_ERROR, 500, 'Email delivery failed.'); }
    },
    async verify(userId: string, code: string): Promise<void> {
      const at = clock().toISOString();
      const valid = await db.transaction().execute(async trx => {
        const row = await trx.selectFrom('email_verification_codes').selectAll().where('user_id', '=', userId).where('consumed_at', 'is', null).orderBy('created_at', 'desc').executeTakeFirst();
        if (!row || row.expires_at <= at || row.attempts >= 5) return false;
        const matched = matchesToken(`${userId}:${code}`, row.code_hash, secret);
        const changed = await trx.updateTable('email_verification_codes').set({ attempts: row.attempts + 1, ...(matched ? { consumed_at: at } : {}) }).where('id', '=', row.id).where('consumed_at', 'is', null).where('attempts', '=', row.attempts).executeTakeFirst();
        if (Number(changed.numUpdatedRows) !== 1 || !matched) return false;
        const user = await trx.updateTable('users').set({ auth_status: 'verified', email_verified_at: at, updated_at: at }).where('id', '=', userId).where('auth_status', '=', 'pending_email').executeTakeFirst();
        return Number(user.numUpdatedRows) === 1;
      });
      if (!valid) throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 422, 'Verification code is invalid or expired.');
    }
  };
}
