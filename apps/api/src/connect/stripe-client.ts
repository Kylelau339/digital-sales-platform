import type { Env } from '../config/env.js';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import type { ConnectClient } from './service.js';

const stripeVersion = '2026-09-30.endive';

export function createStripeConnectClient(config: Env): ConnectClient {
  const key = config.STRIPE_SECRET_KEY;
  if (!key || !key.startsWith('sk_test_')) throw new DomainError(ERROR_CODES.INTERNAL_ERROR, 500, 'A Stripe test secret key is required for Connect.');
  async function call<T>(path: string, init: RequestInit = {}, idempotencyKey?: string): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${key}`);
    headers.set('Stripe-Version', stripeVersion);
    if (init.body) headers.set('Content-Type', 'application/json');
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
    const response = await fetch(`https://api.stripe.com${path}`, { ...init, headers });
    const body = await response.json().catch(() => null) as (T & { error?: { message?: string } }) | null;
    if (!response.ok || !body) throw new DomainError(ERROR_CODES.INTERNAL_ERROR, 500, body?.error?.message ?? 'Stripe Connect request failed.');
    return body;
  }
  return {
    async createAccount(input) {
      const result = await call<{ id: string; livemode: boolean; configuration?: unknown; requirements?: unknown }>('/v2/core/accounts', { method: 'POST', body: JSON.stringify({ contact_email: input.email, display_name: input.email, dashboard: 'express', configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } }, defaults: { responsibilities: { fees_collector: 'application', losses_collector: 'application' } }, metadata: { user_id: input.userId }, include: ['configuration.recipient', 'requirements'] }) }, input.idempotencyKey);
      return { id: result.id, livemode: result.livemode, capabilities: result.configuration, requirements: result.requirements };
    },
    async createAccountLink(input) {
      const result = await call<{ url: string }>('/v2/core/account_links', { method: 'POST', body: JSON.stringify({ account: input.account, use_case: { type: 'account_onboarding', account_onboarding: { configurations: ['recipient'], refresh_url: input.refreshUrl, return_url: input.returnUrl, collection_options: { fields: 'currently_due', future_requirements: 'include' } } } }) });
      return { url: result.url };
    },
    async retrieveAccount(accountId) {
      const result = await call<{ id: string; livemode: boolean; configuration?: unknown; requirements?: unknown }>(`/v2/core/accounts/${encodeURIComponent(accountId)}?include[]=configuration.recipient&include[]=requirements`);
      return { id: result.id, livemode: result.livemode, capabilities: result.configuration, requirements: result.requirements };
    }
  };
}
