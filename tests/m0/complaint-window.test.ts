import { describe, expect, it, vi } from 'vitest';
import type { Complaint, Order } from '@shared/contracts/domain.js';
import { CreateComplaintUseCase } from '../../apps/api/src/application/complaints/create-complaint.js';
import type { CreateComplaintInput } from '../../apps/api/src/repositories/ports/index.js';

const paidAt = '2026-01-01T00:00:00.000Z';
function baseOrder(): Order {
  return {
    id: 'ord_1', orderNo: 'M0-1', buyerId: 'buyer_1', sellerId: 'seller_1', templateId: 'tpl_1', versionId: 'ver_1',
    licenseType: 'commercial_single_project', licensePriceFactor: '1', priceCents: 1000, pricingCurrency: 'USD', paymentCurrency: 'USD', paymentAmountMinor: 1000,
    quoteRate: null, quoteExpiresAt: null, quoteId: null, platformFeeCents: 100, sellerAmountCents: 900, taxSnapshot: {}, refundPolicyVersion: 'v2.1', refundPolicySnapshot: {
      windowDays: 7, eligible: ['file_corrupted_or_inaccessible', 'materially_not_as_described', 'duplicate_purchase'],
      exclusions: ['already_downloaded', 'subjective_dissatisfaction'], windowExemptReasons: ['technical_unavailable', 'file_corrupted_or_inaccessible'], manualReviewRequired: true
    }, items: [{ templateId: 'tpl_1', versionId: 'ver_1', licenseType: 'commercial_single_project', priceCents: 1000 }],
    paymentStatus: 'paid', orderStatus: 'fulfilled', paidAt, createdAt: paidAt, updatedAt: paidAt
  };
}
function setup(order = baseOrder()) {
  const create = vi.fn(async (input: CreateComplaintInput): Promise<Complaint> => ({ ...input, status: 'submitted', refundDecision: 'not_requested', refundAmountUsdCents: null, timeline: [], createdAt: input.now, updatedAt: input.now }));
  const useCase = new CreateComplaintUseCase({ orders: { findById: async () => order }, complaints: { create } });
  return { create, useCase };
}
const request = { buyerId: 'buyer_1', orderId: 'ord_1', entitlementId: null, reason: 'duplicate_purchase' as const, description: 'Purchased the same version twice.' };

describe('M0 complaint policy window in the application layer', () => {
  it('accepts day 7 and the exact UTC deadline', async () => {
    const { useCase, create } = setup();
    await useCase.execute({ ...request, now: '2026-01-07T12:00:00.000Z' });
    const complaint = await useCase.execute({ ...request, now: '2026-01-08T00:00:00.000Z' });
    expect(complaint.reviewRoute).toBe('standard');
    expect(create).toHaveBeenCalledTimes(2);
  });
  it.each(['2026-01-08T00:00:00.001Z', '2026-01-09T00:00:00.000Z'])('rejects after deadline without persistence: %s', async now => {
    const { useCase, create } = setup();
    await expect(useCase.execute({ ...request, now })).rejects.toMatchObject({ code: 'REFUND_WINDOW_EXPIRED' });
    expect(create).not.toHaveBeenCalled();
  });
  it.each(['technical_unavailable', 'file_corrupted_or_inaccessible'] as const)('routes %s manually beyond the window', async reason => {
    const { useCase } = setup();
    const complaint = await useCase.execute({ ...request, reason, now: '2027-02-01T00:00:00.000Z' });
    expect(complaint.reviewRoute).toBe('manual_review');
    expect(complaint.status).toBe('submitted');
  });
  it('uses the historical order snapshot rather than the current policy', async () => {
    const order = baseOrder();
    order.refundPolicySnapshot.windowDays = 2;
    const { useCase } = setup(order);
    await expect(useCase.execute({ ...request, now: '2026-01-04T00:00:00.000Z' })).rejects.toMatchObject({ code: 'REFUND_WINDOW_EXPIRED' });
  });
  it('rejects a different buyer and derives version/template from stored order', async () => {
    const { useCase, create } = setup();
    await expect(useCase.execute({ ...request, buyerId: 'someone_else', now: '2026-01-02T00:00:00.000Z' })).rejects.toBeDefined();
    expect(create).not.toHaveBeenCalled();
    await useCase.execute({ ...request, now: '2026-01-02T00:00:00.000Z' });
    expect(create.mock.calls[0]?.[0]).toMatchObject({ templateId: 'tpl_1', versionId: 'ver_1', actorId: 'buyer_1' });
  });
});
