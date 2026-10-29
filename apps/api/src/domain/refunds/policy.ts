import type { Order } from '@shared/contracts/domain.js';
import type { ComplaintReason } from '@shared/enums/domain.js';
import { plusDays } from '@shared/time.js';

export type RefundBlocker =
  | 'CURRENCY_UNSUPPORTED'
  | 'ORDER_NOT_PAID'
  | 'REASON_NOT_ELIGIBLE'
  | 'REFUND_WINDOW_EXPIRED'
  | 'ALREADY_DOWNLOADED';

export interface RefundPolicyEvaluation {
  eligible: boolean;
  blockers: RefundBlocker[];
  fullRefundCents: number;
  windowExpiresAt: string | null;
}

/** Evaluates the frozen policy snapshot captured on the order, never the current policy. */
export function evaluateRefundPolicy(input: { order: Order; reason: ComplaintReason; now: string; downloadCount: number }): RefundPolicyEvaluation {
  const { order, reason, now, downloadCount } = input;
  const blockers: RefundBlocker[] = [];
  const snapshot = order.refundPolicySnapshot;
  const eligibleReason = snapshot.eligible.includes(reason);
  const exempt = snapshot.windowExemptReasons.includes(reason);
  const windowExpiresAt = order.paidAt ? plusDays(order.paidAt, snapshot.windowDays) : null;

  if (order.paymentCurrency !== 'USD') blockers.push('CURRENCY_UNSUPPORTED');
  if (order.paymentStatus !== 'paid' || !order.paidAt) blockers.push('ORDER_NOT_PAID');
  if (!eligibleReason) blockers.push('REASON_NOT_ELIGIBLE');
  if (eligibleReason && !exempt && windowExpiresAt && Date.parse(now) > Date.parse(windowExpiresAt)) blockers.push('REFUND_WINDOW_EXPIRED');
  if (eligibleReason && !exempt && snapshot.exclusions.includes('already_downloaded') && downloadCount > 0) blockers.push('ALREADY_DOWNLOADED');

  const amountTax = Number((order.taxSnapshot as { amountTax?: number }).amountTax ?? 0);
  const fullRefundCents = order.paymentAmountMinor + (Number.isFinite(amountTax) && amountTax > 0 ? amountTax : 0);
  return { eligible: blockers.length === 0, blockers, fullRefundCents, windowExpiresAt };
}
