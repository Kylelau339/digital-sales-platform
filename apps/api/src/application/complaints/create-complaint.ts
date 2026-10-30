import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import type { Complaint } from '@shared/contracts/domain.js';
import type { ComplaintReason } from '@shared/enums/domain.js';
import { complaintRequestSchema, orderSchema, validate } from '@shared/schemas/domain.js';
import { plusDays, nowUtc, id } from '@shared/time.js';
import type { ComplaintRepository, EntitlementRepository, OrderRepository } from '../../repositories/ports/index.js';

export interface CreateComplaintRequest { buyerId: string; orderId: string; entitlementId?: string | null; reason: ComplaintReason; description: string; idempotencyKey?: string; now?: string; }

/** M0 checks only creation eligibility; decisions, refunds and HTTP routing are later milestones. */
export class CreateComplaintUseCase {
  constructor(private readonly deps: { orders: Pick<OrderRepository, 'findById'>; complaints: Pick<ComplaintRepository, 'create'>; entitlements?: Pick<EntitlementRepository, 'findById'> }) {}

  async execute(input: CreateComplaintRequest): Promise<Complaint> {
    const request = validate(complaintRequestSchema, input);
    const stored = await this.deps.orders.findById(request.orderId);
    if (!stored) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Order not found.');
    if (stored.buyerId !== request.buyerId) throw new DomainError(ERROR_CODES.FORBIDDEN, 403, 'Only the order buyer can create a complaint.');
    const order = validate(orderSchema, stored);
    if (order.paymentStatus !== 'paid' || !order.paidAt) throw new DomainError(ERROR_CODES.ORDER_NOT_PAID, 409, 'Only paid orders can create complaints.');
    if (request.entitlementId) {
      const entitlement = await this.deps.entitlements?.findById(request.entitlementId);
      if (!entitlement || entitlement.orderId !== order.id || entitlement.templateId !== order.templateId || entitlement.versionId !== order.versionId || entitlement.licenseType !== order.licenseType) {
        throw new DomainError(ERROR_CODES.FORBIDDEN, 403, 'The entitlement does not belong to this order.');
      }
    }
    const now = request.now ?? nowUtc();
    const eligible = order.refundPolicySnapshot.eligible.includes(request.reason);
    const exempt = order.refundPolicySnapshot.windowExemptReasons.includes(request.reason);
    if (eligible && !exempt && Date.parse(now) > Date.parse(plusDays(order.paidAt, order.refundPolicySnapshot.windowDays))) {
      throw new DomainError(ERROR_CODES.REFUND_WINDOW_EXPIRED, 422, 'The refund window for this complaint has expired.');
    }
    return this.deps.complaints.create({ id: id('CMP'), orderId: order.id, entitlementId: request.entitlementId ?? null, templateId: order.templateId, versionId: order.versionId, reason: request.reason, description: request.description, reviewRoute: eligible && !exempt ? 'standard' : 'manual_review', actorId: request.buyerId, idempotencyKey: request.idempotencyKey ?? null, now });
  }
}
