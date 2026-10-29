import type {
  AuditLog, Complaint, Entitlement, Order, RefundPolicy, TemplateProduct, TemplateVersion, User, AuthSession,
  LicenseProof, PreviewAsset, PaymentTransaction, PackageLicense, TemplateVersionFile, JsonValue
} from '@shared/contracts/domain.js';
import type { ComplaintReason, ComplaintStatus, LicenseType, ReviewRoute, TemplateStatus, UserRole, AuthStatus } from '@shared/enums/domain.js';

export interface PageInput { limit: number; offset: number; }
export interface Page<T> { items: T[]; total: number; }
export interface CreateUserInput { id: string; email: string; passwordHash: string; displayName: string; roles: UserRole[]; now: string; }
export interface CreateSessionInput { id: string; userId: string; csrfTokenHash: string; expiresAt: string; createdAt: string; }
export interface CreateTemplateProductInput {
  id: string; sellerId: string; name: { zh: string; en: string }; summary: { zh: string; en: string }; category: string;
  licenseTypes: LicenseType[]; licensePricing: TemplateProduct['licensePricing']; priceUsdCents: number; version: string; now: string;
}
export interface UpdateTemplateDraftInput { name?: { zh: string; en: string }; summary?: { zh: string; en: string }; category?: string; priceUsdCents?: number; }
export interface CreateTemplateVersionInput { versionId: string; templateId: string; version: string; files: TemplateVersionFile[]; packageLicense: PackageLicense; licenseText: string | null; now: string; }
export interface CreateLicenseProofInput { id: string; templateId: string; versionId: string; declarationVersion: string; declarationItems: LicenseProof['declarationItems']; signer: LicenseProof['signer']; signDate: string; proofFiles: LicenseProof['proofFiles']; proofLink: string | null; now: string; }
export interface UpdateLicenseProofInput { proofFiles?: LicenseProof['proofFiles']; proofLink?: string | null; }
export interface LicenseProofReviewInput { reviewerId: string; reviewedAt: string; verificationStatus: LicenseProof['verificationStatus']; conflictFlag: boolean; }
export type CreatePreviewAssetInput = Omit<PreviewAsset, 'licenseStatus' | 'proofRef' | 'reviewerId' | 'reviewedAt' | 'reviewNotes' | 'createdAt'> & { now: string };
export type CreateRefundPolicyInput = Omit<RefundPolicy, 'isActive'>;
/** Policy/version/snapshot are selected by the repository inside the creation transaction. */
export interface CreateSingleItemOrderInput {
  id: string; orderNo: string; buyerId: string; sellerId: string; templateId: string; versionId: string;
  licenseType: LicenseType; licensePriceFactor: string; priceCents: number; paymentCurrency: Order['paymentCurrency'];
  paymentAmountMinor: number; quoteId?: string | null; quoteRate: Order['quoteRate']; quoteExpiresAt: string | null;
  platformFeeBps?: number; platformFeeCents: number; sellerAmountCents: number; taxSnapshot: Record<string, JsonValue>; idempotencyKey: string; now: string;
}
export interface CreatePaymentTransactionInput { id: string; orderId: string; provider: string; type?: PaymentTransaction['type']; amountMinor: number; pricingAmountUsdCents: number; currency: PaymentTransaction['currency']; eventId?: string | null; status: PaymentTransaction['status']; signatureVerified: boolean; now: string; }
export interface CreateRefundTransactionInput extends CreatePaymentTransactionInput { parentTransactionId: string; }
export interface CreateEntitlementInput { id: string; orderId: string; templateId: string; versionId: string; licenseType: LicenseType; expiresAt: string; now: string; }
export interface ReissueEntitlementInput { id: string; expiresAt: string; now: string; }
export interface DownloadConsumeResult { entitlement: Entitlement; counted: boolean; }
export interface CreateComplaintInput { id: string; orderId: string; entitlementId: string | null; templateId: string; versionId: string; reason: ComplaintReason; description: string; reviewRoute: ReviewRoute; actorId: string; idempotencyKey?: string | null; now: string; }
export interface RefundDecisionInput { decision: 'approved' | 'rejected'; amountUsdCents: number | null; reason: string; actorId: string; now: string; }
export interface ComplaintTimelineEvent { id: string; event: string; actorId: string | null; note: string | null; at: string; }
export interface AppendAuditLogInput { id: string; actor: AuditLog['actor']; action: string; targetType: string; targetId: string; diff: AuditLog['diff']; reason: string | null; requestId: string | null; ip: string | null; userAgent: string | null; at: string; }

export interface UserRepository { create(input: CreateUserInput): Promise<User>; findById(id: string): Promise<User | null>; findByEmail(email: string): Promise<User | null>; updateAuthStatus(id: string, status: AuthStatus): Promise<User>; addRole(id: string, role: UserRole): Promise<User>; }
export interface SessionRepository { create(input: CreateSessionInput): Promise<AuthSession>; findValidById(id: string, now: string): Promise<AuthSession | null>; rotateCsrfToken(sessionId: string, tokenHash: string): Promise<void>; revoke(sessionId: string, at: string): Promise<void>; }
export interface TemplateProductRepository { createDraft(input: CreateTemplateProductInput): Promise<TemplateProduct>; findById(id: string): Promise<TemplateProduct | null>; listBySeller(sellerId: string, page: PageInput): Promise<Page<TemplateProduct>>; updateDraft(id: string, patch: UpdateTemplateDraftInput): Promise<TemplateProduct>; transitionStatus(id: string, from: TemplateStatus, to: TemplateStatus, reason: string, actorId: string): Promise<TemplateProduct>; }
export interface TemplateVersionRepository { createDraft(input: CreateTemplateVersionInput): Promise<TemplateVersion>; findById(id: string): Promise<TemplateVersion | null>; listHistory(templateId: string): Promise<TemplateVersion[]>; }
export interface LicenseProofRepository { createDraft(input: CreateLicenseProofInput): Promise<LicenseProof>; findByVersion(versionId: string): Promise<LicenseProof | null>; updateDraft(id: string, patch: UpdateLicenseProofInput): Promise<LicenseProof>; }
export interface PreviewAssetRepository { create(input: CreatePreviewAssetInput): Promise<PreviewAsset>; listByVersion(versionId: string): Promise<PreviewAsset[]>; }
export interface RefundPolicyRepository { getCurrent(): Promise<RefundPolicy>; findByVersion(version: string): Promise<RefundPolicy | null>; createVersion(input: CreateRefundPolicyInput): Promise<RefundPolicy>; }
export interface OrderRepository { createSingleItemPendingPayment(input: CreateSingleItemOrderInput): Promise<Order>; findById(id: string): Promise<Order | null>; findByIdempotencyKey(key: string): Promise<Order | null>; }
export interface EntitlementRepository { findById(id: string): Promise<Entitlement | null>; listByBuyer(buyerId: string, page: PageInput): Promise<Page<Entitlement>>; }
export interface ComplaintRepository { create(input: CreateComplaintInput): Promise<Complaint>; findById(id: string): Promise<Complaint | null>; listByBuyer(buyerId: string, page: PageInput): Promise<Page<Complaint>>; }
export interface AuditLogRepository { append(input: AppendAuditLogInput): Promise<AuditLog>; listByTarget(targetType: string, targetId: string, page: PageInput): Promise<Page<AuditLog>>; list(page: PageInput): Promise<Page<AuditLog>>; }

/** Future capabilities are declarations only and are never wired into the M0 factory. */
export interface LicenseProofReviewRepository { recordReview(id: string, input: LicenseProofReviewInput): Promise<LicenseProof>; }
export interface TemplatePublicationRepository { setCurrentVersion(templateId: string, versionId: string, actorId: string): Promise<void>; }
export interface PreviewReviewRepository { updateLicenseStatus(id: string, status: PreviewAsset['licenseStatus'], reviewerId: string, note?: string): Promise<PreviewAsset>; }
export interface OrderPaymentRepository { markPaid(id: string, paidAt: string, transactionId: string): Promise<Order>; markRefunded(id: string): Promise<Order>; }
export interface TransactionRepository { insertPayment(input: CreatePaymentTransactionInput): Promise<PaymentTransaction>; insertRefund(input: CreateRefundTransactionInput): Promise<PaymentTransaction>; findByEventId(eventId: string): Promise<PaymentTransaction | null>; findByOrderId(orderId: string): Promise<PaymentTransaction[]>; }
export interface EntitlementIssuanceRepository { createForPaidOrder(input: CreateEntitlementInput): Promise<Entitlement>; revoke(id: string, reason: string, actorId: string): Promise<Entitlement>; reissue(oldId: string, input: ReissueEntitlementInput, actorId: string): Promise<{ oldEntitlement: Entitlement; newEntitlement: Entitlement }>; }
export interface EntitlementDownloadRepository { consumeOne(id: string, requestKey: string, now: string): Promise<DownloadConsumeResult>; }
export interface ComplaintReviewRepository { updateStatus(id: string, status: ComplaintStatus, actorId: string, reason: string): Promise<Complaint>; recordRefundDecision(id: string, input: RefundDecisionInput): Promise<Complaint>; appendTimeline(id: string, event: ComplaintTimelineEvent): Promise<void>; }

export interface TransactionRepositories {
  users: UserRepository; sessions: SessionRepository; products: TemplateProductRepository; versions: TemplateVersionRepository;
  proofs: LicenseProofRepository; previews: PreviewAssetRepository; policies: RefundPolicyRepository; orders: OrderRepository;
  entitlements: EntitlementRepository; complaints: ComplaintRepository; audit: AuditLogRepository;
}
/** Callbacks must perform only short repository operations, with no external work. */
export interface UnitOfWork { execute<T>(work: (repositories: TransactionRepositories) => Promise<T>): Promise<T>; }
export interface RepositoryFactory { create(): TransactionRepositories; }
