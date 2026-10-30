import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb } from '../../apps/api/src/db/client.js';
import { migrate } from '../../apps/api/src/db/cli.js';
import { createApp } from '../../apps/api/src/app.js';
import { loadEnv } from '../../apps/api/src/config/env.js';
import type { Database } from '../../apps/api/src/db/types.js';
import type { CheckoutClient } from '../../apps/api/src/payments/service.js';
import type { RefundClient } from '../../apps/api/src/refunds/service.js';
import type { VerificationSender } from '../../apps/api/src/auth/email-verification.js';

export const origin = 'http://localhost:5173';
export const baseTime = '2026-10-29T00:00:00.000Z';
export const policySnapshot = { windowDays: 7, eligible: ['file_corrupted_or_inaccessible', 'materially_not_as_described', 'duplicate_purchase'], exclusions: ['already_downloaded', 'subjective_dissatisfaction'], windowExemptReasons: ['technical_unavailable', 'file_corrupted_or_inaccessible'], manualReviewRequired: true };

export interface Session { cookie: string; csrf: string; userId: string; email: string; }
export interface RefundCall { paymentIntent: string; amountMinor: number; currency: string; complaintId: string; orderId: string; idempotencyKey: string; }
export interface Harness {
  db: Kysely<Database>;
  app: FastifyInstance;
  folder: string;
  buyer: Session;
  seller: Session;
  admin: Session;
  refundCalls: RefundCall[];
  setWebhookEvent(value: unknown): void;
  close(): Promise<void>;
}

async function register(app: FastifyInstance, email: string, displayName: string): Promise<Session> {
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin }, payload: { email, password: 'Test-Password-123', displayName } });
  if (response.statusCode !== 201) throw new Error(`register failed: ${response.body}`);
  const body = response.json();
  const cookie = response.cookies.find(item => item.name === 'motion_session')!;
  return { cookie: `motion_session=${encodeURIComponent(cookie.value)}`, csrf: body.csrfToken, userId: body.user.id, email };
}

export function headers(session: Session, key?: string): Record<string, string> {
  return { origin, cookie: session.cookie, 'x-csrf-token': session.csrf, ...(key ? { 'idempotency-key': key } : {}) };
}

export async function createHarness(options: { verificationSender?: VerificationSender; platformFeeBps?: number } = {}): Promise<Harness> {
  const folder = mkdtempSync(join(tmpdir(), 'motion-m3-'));
  const db = createDb(':memory:');
  await migrate(db);
  let webhookEvent: unknown = null;
  const refundCalls: RefundCall[] = [];
  const checkoutClient: CheckoutClient = {
    async create() { return { id: 'cs_m3', url: 'https://checkout.test/m3', expiresAt: baseTime }; },
    verify(_rawBody, signature) { if (signature !== 'valid') throw new Error('invalid signature'); return webhookEvent; }
  };
  const refundClient: RefundClient = {
    async create(input) {
      refundCalls.push(input);
      return { id: `re_${refundCalls.length}`, status: 'succeeded', amount: input.amountMinor, currency: 'USD' };
    }
  };
  const app = createApp(db, loadEnv({ NODE_ENV: 'test', ALLOWED_ORIGIN: origin, PRIVATE_STORAGE_PATH: folder, STRIPE_WEBHOOK_SECRET: 'whsec_test', PLATFORM_FEE_BPS: String(options.platformFeeBps ?? 1000) }), { checkoutClient, refundClient, ...(options.verificationSender ? { verificationSender: options.verificationSender } : {}) });
  await app.ready();
  const seller = await register(app, 'seller@example.com', 'Seller');
  const admin = await register(app, 'admin@example.com', 'Admin');
  const buyer = await register(app, 'buyer@example.com', 'Buyer');
  await db.updateTable('users').set({ roles_json: '["seller"]', auth_status: 'verified', email_verified_at: baseTime }).where('id', '=', seller.userId).execute();
  await db.updateTable('users').set({ roles_json: '["admin"]', auth_status: 'verified', email_verified_at: baseTime }).where('id', '=', admin.userId).execute();
  await db.updateTable('users').set({ auth_status: 'verified', email_verified_at: baseTime }).where('id', '=', buyer.userId).execute();
  await db.insertInto('template_products').values({ id: 'tpl_m3', seller_id: seller.userId, name_json: '{"zh":"M3 模板","en":"M3 Template"}', summary_json: '{"zh":"測試","en":"Test"}', category: 'intro', tags_json: '[]', license_types_json: '["commercial_single_project"]', license_pricing_json: '[{"licenseType":"commercial_single_project","factor":"1","priceUsdCents":10000}]', price_usd_cents: 10000, status: 'approved', published_at: baseTime, current_version_id: 'ver_m3', review_target_version_id: null, version: '1.0.0', rating: 0, rating_count: 0, sales_recent_json: '0', early_signal_json: '{}', ranking_updated_at: null, updated_at: baseTime, created_at: baseTime }).execute();
  await db.insertInto('template_versions').values({ version_id: 'ver_m3', template_id: 'tpl_m3', version: '1.0.0', status: 'approved', revision: 1, package_license_json: '{"parserStatus":"parsed","file":null,"detected":null,"excerpt":null}', license_text: null, scan_job_id: 'scan_m3', scan_status: 'passed', conflict_flag: 0, conflict_reasons_json: '[]', immutable: 1, created_at: baseTime, submitted_at: baseTime, approved_at: baseTime }).execute();
  return {
    db, app, folder, buyer, seller, admin, refundCalls,
    setWebhookEvent(value: unknown) { webhookEvent = value; },
    async close() { if (app) await app.close(); if (db) await db.destroy(); rmSync(folder, { recursive: true, force: true }); }
  };
}

export async function seedPaidOrder(h: Harness, overrides: { id?: string; orderNo?: string; priceCents?: number; taxCents?: number; paidAt?: string; buyerId?: string; sellerId?: string; templateId?: string; versionId?: string; platformFeeBps?: number } = {}): Promise<{ orderId: string; entitlementId: string; transactionId: string }> {
  const orderId = overrides.id ?? 'order_m3';
  const priceCents = overrides.priceCents ?? 10000;
  const taxCents = overrides.taxCents ?? 0;
  const paidAt = overrides.paidAt ?? baseTime;
  const buyerId = overrides.buyerId ?? h.buyer.userId;
  const sellerId = overrides.sellerId ?? h.seller.userId;
  const templateId = overrides.templateId ?? 'tpl_m3';
  const versionId = overrides.versionId ?? 'ver_m3';
  const platformFeeBps = overrides.platformFeeBps ?? 1000;
  const platformFeeCents = Math.floor(priceCents * platformFeeBps / 10000);
  const sellerAmountCents = priceCents - platformFeeCents;
  await h.db.insertInto('orders').values({ id: orderId, order_no: overrides.orderNo ?? `M3-${orderId}`, buyer_id: buyerId, seller_id: sellerId, template_id: templateId, version_id: versionId, license_type: 'commercial_single_project', license_price_factor: '1', price_cents: priceCents, pricing_currency: 'USD', payment_currency: 'USD', payment_amount_minor: priceCents, quote_rate_json: null, quote_expires_at: null, quote_id: null, refund_policy_version: 'v2.1', refund_policy_snapshot_json: JSON.stringify(policySnapshot), platform_fee_bps: platformFeeBps, platform_fee_cents: platformFeeCents, seller_amount_cents: sellerAmountCents, tax_snapshot_json: JSON.stringify({ automaticTax: true, amountTax: taxCents, amountSubtotal: priceCents, amountTotal: priceCents + taxCents }), payment_status: 'paid', order_status: 'fulfilled', paid_at: paidAt, idempotency_key: `checkout:${orderId}`, stripe_checkout_session_id: `cs_${orderId}`, checkout_session_expires_at: null, created_at: paidAt, updated_at: paidAt }).execute();
  await h.db.insertInto('order_items').values({ order_id: orderId, template_id: templateId, version_id: versionId, license_type: 'commercial_single_project', price_cents: priceCents }).execute();
  const transactionId = `txn_${orderId}`;
  await h.db.insertInto('transactions').values({ id: transactionId, order_id: orderId, parent_transaction_id: null, provider: 'stripe', type: 'payment', amount_minor: priceCents, pricing_amount_usd_cents: priceCents, currency: 'USD', provider_transaction_id: `pi_${orderId}`, event_id: `evt_${orderId}`, idempotency_key: `stripe:pi_${orderId}`, status: 'succeeded', signature_verified: 1, raw_event_hash: null, failure_reason: null, refund_request_id: null, created_at: paidAt, processed_at: paidAt, chain: null, tx_hash: null, from_address: null, to_address: null, confirmations: null, required_confirmations: null }).execute();
  const entitlementId = `ent_${orderId}`;
  await h.db.insertInto('entitlements').values({ id: entitlementId, order_id: orderId, template_id: templateId, version_id: versionId, license_type: 'commercial_single_project', max_downloads: 10, download_count: 0, expires_at: '2027-10-29T00:00:00.000Z', status: 'active', reissued_from_id: null, reissued_to_id: null, revoke_reason_public: null, revoke_reason_internal: null, last_downloaded_at: null, created_at: paidAt, updated_at: paidAt }).execute();
  return { orderId, entitlementId, transactionId };
}
