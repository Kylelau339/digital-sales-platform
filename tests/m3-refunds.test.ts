import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, headers, seedPaidOrder, type Harness } from './helpers/m3';

let h: Harness;
const now = new Date().toISOString();

beforeEach(async () => { h = await createHarness(); });
afterEach(async () => { await h.close(); });

async function createComplaint(reason = 'materially_not_as_described', key = 'complaint-key-1', orderId = 'order_m3') {
  return h.app.inject({ method: 'POST', url: '/api/v1/complaints', headers: headers(h.buyer, key), payload: { orderId, entitlementId: `ent_${orderId}`, reason, description: 'The delivered package is materially different from the listing.' } });
}

async function approve(complaintId: string, amount = 10000, key = 'refund-approve-1') {
  return h.app.inject({ method: 'POST', url: `/api/v1/admin/complaints/${complaintId}/refund/approve`, headers: headers(h.admin, key), payload: { amountUsdCents: amount, reason: 'Policy and evidence confirmed.' } });
}

describe('M3 complaints and refunds', () => {
  it('creates buyer complaints idempotently and applies the window only to refund-eligible reasons', async () => {
    await seedPaidOrder(h, { paidAt: now });
    const first = await createComplaint('duplicate_purchase');
    expect(first.statusCode, first.body).toBe(201);
    const complaintId = first.json().complaint.id;
    const replay = await createComplaint('duplicate_purchase');
    expect(replay.statusCode).toBe(200);
    expect(replay.json().complaint.id).toBe(complaintId);
    const changed = await h.app.inject({ method: 'POST', url: '/api/v1/complaints', headers: headers(h.buyer, 'complaint-key-1'), payload: { orderId: 'order_m3', entitlementId: 'ent_order_m3', reason: 'copyright', description: 'Different payload.' } });
    expect(changed.statusCode).toBe(409);

    await seedPaidOrder(h, { id: 'order_old', paidAt: '2026-01-01T00:00:00.000Z' });
    const copyright = await h.app.inject({ method: 'POST', url: '/api/v1/complaints', headers: headers(h.buyer, 'copyright-old'), payload: { orderId: 'order_old', entitlementId: 'ent_order_old', reason: 'copyright', description: 'The package contains unlicensed material.' } });
    expect(copyright.statusCode, copyright.body).toBe(201);
    const expired = await h.app.inject({ method: 'POST', url: '/api/v1/complaints', headers: headers(h.buyer, 'expired-refund'), payload: { orderId: 'order_old', entitlementId: 'ent_order_old', reason: 'duplicate_purchase', description: 'Bought twice.' } });
    expect(expired.statusCode).toBe(422);
  });

  it('approves a full refund, revokes the entitlement and records the ledger once', async () => {
    await seedPaidOrder(h, { paidAt: now });
    const complaint = await createComplaint();
    expect(complaint.statusCode, complaint.body).toBe(201);
    const complaintId = complaint.json().complaint.id;

    const response = await approve(complaintId, 10000);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ status: 'succeeded', replay: false });
    expect(h.refundCalls).toHaveLength(1);
    expect(h.refundCalls[0]).toMatchObject({ paymentIntent: 'pi_order_m3', amountMinor: 10000, currency: 'USD', complaintId, orderId: 'order_m3', idempotencyKey: `refund:${complaintId}` });

    const order = await h.db.selectFrom('orders').selectAll().where('id', '=', 'order_m3').executeTakeFirstOrThrow();
    expect(order).toMatchObject({ payment_status: 'refunded', order_status: 'refunded' });
    const entitlement = await h.db.selectFrom('entitlements').selectAll().where('id', '=', 'ent_order_m3').executeTakeFirstOrThrow();
    expect(entitlement.status).toBe('revoked');
    expect(entitlement.revoke_reason_public).toBe('Order refunded');
    const refundTx = await h.db.selectFrom('transactions').selectAll().where('order_id', '=', 'order_m3').where('type', '=', 'refund').execute();
    expect(refundTx).toHaveLength(1);
    expect(refundTx[0]).toMatchObject({ status: 'succeeded', amount_minor: 10000, provider_transaction_id: 're_1', parent_transaction_id: 'txn_order_m3' });
    const storedComplaint = await h.db.selectFrom('complaints').selectAll().where('id', '=', complaintId).executeTakeFirstOrThrow();
    expect(storedComplaint).toMatchObject({ refund_decision: 'approved', refund_amount_usd_cents: 10000, status: 'resolved' });
    const audit = await h.db.selectFrom('audit_logs').selectAll().where('action', '=', 'complaint.refund_succeeded').execute();
    expect(audit).toHaveLength(1);
    expect(audit[0]!.request_id).toBeTruthy();
    const refundRequest = await h.db.selectFrom('refund_requests').selectAll().where('complaint_id', '=', complaintId).executeTakeFirstOrThrow();
    expect(refundRequest).toMatchObject({ product_refund_cents: 10000, tax_refund_cents: 0, platform_fee_reversal_cents: 1000, seller_reversal_cents: 9000 });

    const replay = await approve(complaintId, 10000);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ replay: true });
    expect(h.refundCalls).toHaveLength(1);
  });

  it('reconciles refund webhooks idempotently', async () => {
    await seedPaidOrder(h, { paidAt: now });
    const complaint = await createComplaint();
    const complaintId = complaint.json().complaint.id;
    expect((await approve(complaintId)).statusCode).toBe(200);

    h.setWebhookEvent({ id: 'evt_refund_1', type: 'refund.updated', data: { object: { id: 're_1', payment_intent: 'pi_order_m3', amount: 10000, currency: 'usd', status: 'succeeded' } } });
    const payload = JSON.stringify({ id: 'evt_refund_1', type: 'refund.updated', data: { object: { id: 're_1', payment_intent: 'pi_order_m3', amount: 10000, currency: 'usd', status: 'succeeded' } } });
    const first = await h.app.inject({ method: 'POST', url: '/api/v1/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': 'valid' }, payload });
    expect(first.statusCode, first.body).toBe(200);
    const second = await h.app.inject({ method: 'POST', url: '/api/v1/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': 'valid' }, payload });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ ignored: true, duplicate: true });
    expect(await h.db.selectFrom('transactions').selectAll().where('type', '=', 'refund').execute()).toHaveLength(1);
    expect(await h.db.selectFrom('payment_event_inbox').selectAll().where('event_id', '=', 'evt_refund_1').executeTakeFirst()).toMatchObject({ status: 'processed' });
  });

  it('rejects refunds, blocks non-refundable reasons, and enforces admin access', async () => {
    await seedPaidOrder(h, { paidAt: now });
    const complaint = await createComplaint('copyright');
    const complaintId = complaint.json().complaint.id;
    const blocked = await approve(complaintId);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().details.blockers).toContain('REASON_NOT_ELIGIBLE');

    const forbidden = await h.app.inject({ method: 'POST', url: `/api/v1/admin/complaints/${complaintId}/refund/approve`, headers: headers(h.buyer, 'buyer-refund'), payload: { amountUsdCents: 10000, reason: 'Buyer cannot approve.' } });
    expect(forbidden.statusCode).toBe(403);

    const rejected = await h.app.inject({ method: 'POST', url: `/api/v1/admin/complaints/${complaintId}/refund/reject`, headers: headers(h.admin, 'reject-key-1'), payload: { reason: 'This reason is a rights dispute, not a refund.' } });
    expect(rejected.statusCode, rejected.body).toBe(200);
    const stored = await h.db.selectFrom('complaints').selectAll().where('id', '=', complaintId).executeTakeFirstOrThrow();
    expect(stored).toMatchObject({ refund_decision: 'rejected', status: 'rejected' });
    expect(await h.db.selectFrom('audit_logs').selectAll().where('action', '=', 'complaint.refund_rejected').execute()).toHaveLength(1);
  });

  it('rejects a non-full refund amount', async () => {
    await seedPaidOrder(h, { paidAt: now });
    const complaint = await createComplaint();
    const response = await approve(complaint.json().complaint.id, 5000);
    expect(response.statusCode).toBe(409);
    expect(response.json().details.expected).toBe(10000);
    expect(h.refundCalls).toHaveLength(0);
  });
});
