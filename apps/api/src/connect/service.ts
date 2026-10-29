import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import { id, nowUtc } from '@shared/time.js';

export interface ConnectClient {
  createAccount(input: { email: string; userId: string; idempotencyKey: string }): Promise<{ id: string; livemode: boolean; capabilities?: unknown; requirements?: unknown }>;
  createAccountLink(input: { account: string; refreshUrl: string; returnUrl: string }): Promise<{ url: string }>;
  retrieveAccount(accountId: string): Promise<{ id: string; livemode: boolean; capabilities?: unknown; requirements?: unknown }>;
}

export function connectWebhookSignature(payload: string, secret: string, timestamp: string): string {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')}`;
}
function verifyStripeSignature(payload: string, header: string, secret: string, now = Math.floor(Date.now() / 1000)): boolean {
  const fields = Object.fromEntries(header.split(',').map(part => { const [key, value] = part.split('=', 2); return [key, value]; }));
  if (!fields.t || !fields.v1 || Math.abs(now - Number(fields.t)) > 300) return false;
  const actual = Buffer.from(createHmac('sha256', secret).update(`${fields.t}.${payload}`).digest('hex'));
  const expected = Buffer.from(fields.v1);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function accountActive(account: { capabilities?: unknown; requirements?: unknown }): boolean {
  const capabilities = JSON.stringify(account.capabilities ?? {});
  const requirements = JSON.stringify(account.requirements ?? {});
  return capabilities.includes('active') && !requirements.includes('currently_due') && !requirements.includes('past_due');
}

export function registerConnectService(db: Kysely<Database>, client: ConnectClient, config: { webhookSecret: string | undefined; returnUrl: string; refreshUrl: string }) {
  const finishIntent = async (intentId: string, sellerId: string, email: string) => {
    const account = await client.createAccount({ email, userId: sellerId, idempotencyKey: intentId });
    if (account.livemode) throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Live Stripe account returned in test mode.');
    const at = nowUtc();
    try {
      await db.transaction().execute(async trx => {
        await trx.insertInto('seller_connected_accounts').values({ seller_id: sellerId, stripe_account_id: account.id, livemode: 0, onboarding_status: 'pending', capabilities_json: JSON.stringify(account.capabilities ?? {}), requirements_json: JSON.stringify(account.requirements ?? {}), synced_at: at }).execute();
        await trx.updateTable('connect_account_intents').set({ stripe_account_id: account.id, status: 'created', updated_at: at }).where('id', '=', intentId).execute();
      });
    } catch {
      return db.selectFrom('seller_connected_accounts').selectAll().where('seller_id', '=', sellerId).executeTakeFirstOrThrow();
    }
    return db.selectFrom('seller_connected_accounts').selectAll().where('seller_id', '=', sellerId).executeTakeFirstOrThrow();
  };
  return {
    async createAccount(sellerId: string, email: string, idempotencyKey: string) {
      const found = await db.selectFrom('connect_account_intents').selectAll().where('seller_id', '=', sellerId).where('idempotency_key', '=', idempotencyKey).executeTakeFirst();
      if (found?.stripe_account_id) return db.selectFrom('seller_connected_accounts').selectAll().where('seller_id', '=', sellerId).executeTakeFirstOrThrow();
      if (found) return finishIntent(found.id, sellerId, email);
      const intentId = id('connectintent'); const at = nowUtc();
      try { await db.insertInto('connect_account_intents').values({ id: intentId, seller_id: sellerId, idempotency_key: idempotencyKey, stripe_account_id: null, status: 'pending', created_at: at, updated_at: at }).execute(); }
      catch {
        const concurrent = await db.selectFrom('connect_account_intents').selectAll().where('seller_id', '=', sellerId).where('idempotency_key', '=', idempotencyKey).executeTakeFirst();
        if (!concurrent) throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Connect account request is already being processed.');
        if (concurrent.stripe_account_id) return db.selectFrom('seller_connected_accounts').selectAll().where('seller_id', '=', sellerId).executeTakeFirstOrThrow();
        return finishIntent(concurrent.id, sellerId, email);
      }
      return finishIntent(intentId, sellerId, email);
    },
    async status(sellerId: string) {
      return (await db.selectFrom('seller_connected_accounts').selectAll().where('seller_id', '=', sellerId).executeTakeFirst()) ?? null;
    },
    async onboardingLink(sellerId: string) {
      const account = await db.selectFrom('seller_connected_accounts').selectAll().where('seller_id', '=', sellerId).executeTakeFirst();
      if (!account) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Connected account not found.');
      return client.createAccountLink({ account: account.stripe_account_id, refreshUrl: config.refreshUrl, returnUrl: config.returnUrl });
    },
    async webhook(payload: string, signature: string | undefined) {
      if (!config.webhookSecret || !signature || !verifyStripeSignature(payload, signature, config.webhookSecret)) throw new DomainError(ERROR_CODES.PAYMENT_WEBHOOK_INVALID, 400, 'Invalid Connect webhook signature.');
      const event = JSON.parse(payload) as { id: string; type: string; data?: { object?: { id?: string } } };
      const accountId = event.data?.object?.id;
      if (!event.id || !accountId) throw new DomainError(ERROR_CODES.PAYMENT_WEBHOOK_INVALID, 400, 'Invalid Connect webhook payload.');
      const seen = await db.selectFrom('connect_account_intents').select('id').where('idempotency_key', '=', `event:${event.id}`).executeTakeFirst();
      if (seen) return { duplicate: true };
      const account = await client.retrieveAccount(accountId); const at = nowUtc();
      const seller = await db.selectFrom('seller_connected_accounts').select('seller_id').where('stripe_account_id', '=', accountId).executeTakeFirst();
      if (!seller) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Connected account not found.');
      await db.transaction().execute(async trx => {
        await trx.insertInto('connect_account_intents').values({ id: id('connectevent'), seller_id: seller.seller_id, idempotency_key: `event:${event.id}`, stripe_account_id: accountId, status: 'processed', created_at: at, updated_at: at }).execute();
        await trx.updateTable('seller_connected_accounts').set({ onboarding_status: accountActive(account) ? 'active' : 'restricted', capabilities_json: JSON.stringify(account.capabilities ?? {}), requirements_json: JSON.stringify(account.requirements ?? {}), synced_at: at }).where('stripe_account_id', '=', accountId).execute();
      });
      return { duplicate: false };
    }
  };
}
