import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, headers, seedPaidOrder, type Harness } from './helpers/m3';

let h: Harness;

beforeEach(async () => { h = await createHarness({ platformFeeBps: 1500 }); });
afterEach(async () => { await h.close(); });

describe('M3 seller earnings', () => {
  it('aggregates sales, platform fees, refunds and tax with integer precision', async () => {
    const first = await seedPaidOrder(h, { id: 'order_oct_1', priceCents: 10000, taxCents: 1000, paidAt: '2026-10-01T12:00:00.000Z', platformFeeBps: 1500 });
    await seedPaidOrder(h, { id: 'order_oct_2', priceCents: 20000, taxCents: 0, paidAt: '2026-10-02T12:00:00.000Z', platformFeeBps: 1500 });
    await seedPaidOrder(h, { id: 'order_sep', priceCents: 5000, taxCents: 0, paidAt: '2026-09-01T12:00:00.000Z', platformFeeBps: 1500 });

    await h.db.insertInto('complaints').values({ id: 'cmp_earn', order_id: 'order_oct_1', entitlement_id: first.entitlementId, template_id: 'tpl_m3', version_id: 'ver_m3', reason: 'materially_not_as_described', description: 'Refund fixture.', status: 'resolved', review_route: 'standard', refund_decision: 'approved', refund_amount_usd_cents: 11000, idempotency_key: null, created_at: '2026-10-03T00:00:00.000Z', updated_at: '2026-10-05T00:00:00.000Z' }).execute();
    await h.db.insertInto('refund_requests').values({ id: 'refund_earn', complaint_id: 'cmp_earn', order_id: 'order_oct_1', requested_by: h.admin.userId, amount_minor: 11000, currency: 'USD', status: 'succeeded', stripe_refund_id: 're_earn', stripe_payment_intent: 'pi_order_oct_1', idempotency_key: 'refund-earn-key', failure_reason: null, product_refund_cents: 10000, tax_refund_cents: 1000, platform_fee_reversal_cents: 1500, seller_reversal_cents: 8500, created_at: '2026-10-05T00:00:00.000Z', updated_at: '2026-10-05T00:00:00.000Z' }).execute();

    const response = await h.app.inject({ method: 'GET', url: '/api/v1/seller/earnings?from=2026-10-01&to=2026-10-31', headers: { origin: 'http://localhost:5173', cookie: h.seller.cookie } });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.summary).toEqual({ grossSalesCents: 30000, platformFeeCents: 4500, refundsCents: 8500, netEarningsCents: 17000, taxCollectedCents: 0, orderCount: 2, unitCount: 2 });
    expect(body.templates).toHaveLength(1);
    expect(body.templates[0]).toMatchObject({ templateId: 'tpl_m3', grossSalesCents: 30000, refundsCents: 8500, netEarningsCents: 17000 });
    expect(body.series.map((point: { date: string }) => point.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-05']);
    expect(body.recentOrders).toHaveLength(2);
    expect(body.from).toBe('2026-10-01');
    expect(body.to).toBe('2026-10-31');
  });

  it('enforces verified seller access and a bounded date range', async () => {
    const buyer = await h.app.inject({ method: 'GET', url: '/api/v1/seller/earnings', headers: { origin: 'http://localhost:5173', cookie: h.buyer.cookie } });
    expect(buyer.statusCode).toBe(403);
    const tooWide = await h.app.inject({ method: 'GET', url: '/api/v1/seller/earnings?from=2024-01-01&to=2026-01-01', headers: { origin: 'http://localhost:5173', cookie: h.seller.cookie } });
    expect(tooWide.statusCode).toBe(422);
    const unauthenticated = await h.app.inject({ method: 'GET', url: '/api/v1/seller/earnings', headers: { origin: 'http://localhost:5173' } });
    expect(unauthenticated.statusCode).toBe(401);
  });
});
