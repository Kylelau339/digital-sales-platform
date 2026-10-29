import type {
  ComplaintReason,
  ComplaintStatus,
  EntitlementStatus,
  LicenseType,
  ParserStatus,
  ReviewRoute,
  ScanStatus,
  TemplateStatus,
  UserRole,
  AuthStatus,
  TemplateVersionStatus,
  ProofCaptureStatus,
  ProofCaptureOutcome
} from '../enums/domain.js';

export type UtcIso = string;
export type MoneyMinor = number;
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  authStatus: AuthStatus;
  roles: UserRole[];
  displayName: string;
  emailVerifiedAt: UtcIso | null;
  createdAt: UtcIso;
  updatedAt: UtcIso;
}

export interface AuthSession {
  id: string;
  userId: string;
  csrfTokenHash: string;
  expiresAt: UtcIso;
  revokedAt: UtcIso | null;
  createdAt: UtcIso;
}

export interface RefundPolicySnapshot {
  windowDays: number;
  eligible: string[];
  exclusions: string[];
  windowExemptReasons: ComplaintReason[];
  manualReviewRequired: boolean;
}

export interface RefundPolicy extends RefundPolicySnapshot {
  id: string;
  version: string;
  isActive: boolean;
  createdAt: UtcIso;
}

export interface LicensePricing {
  licenseType: LicenseType;
  factor: string;
  priceUsdCents: MoneyMinor;
}

export interface TemplateProduct {
  id: string;
  sellerId: string;
  name: { zh: string; en: string };
  summary: { zh: string; en: string };
  category: string;
  licenseTypes: LicenseType[];
  licensePricing: LicensePricing[];
  priceUsdCents: MoneyMinor;
  status: TemplateStatus;
  publishedAt: UtcIso | null;
  currentVersionId: string | null;
  reviewTargetVersionId: string | null;
  version: string;
  rating: number;
  salesRecent: number;
  updated: UtcIso;
  createdAt: UtcIso;
}

export interface PackageLicense {
  parserStatus: ParserStatus;
  file: string | null;
  detected: string | null;
  excerpt: string | null;
  rulesetVersion?: string;
  matchedRuleIds?: string[];
  semantic?: {
    commercialUse: 'allowed' | 'prohibited' | 'unknown';
    sourceRedistribution: 'allowed' | 'prohibited' | 'unknown';
    derivativeResale: 'allowed' | 'prohibited' | 'unknown';
    personalUse: 'allowed' | 'prohibited' | 'unknown';
    attribution: 'allowed' | 'prohibited' | 'unknown';
  };
}

export interface TemplateVersion {
  versionId: string;
  templateId: string;
  version: string;
  status?: TemplateVersionStatus;
  revision: number;
  files: TemplateVersionFile[];
  packageLicense: PackageLicense;
  licenseText: string | null;
  scanJobId: string | null;
  scanStatus: ScanStatus;
  conflictFlag: boolean;
  conflictReasons: string[];
  immutable: boolean;
  createdAt: UtcIso;
  submittedAt: UtcIso | null;
  approvedAt: UtcIso | null;
}

export interface TemplateVersionFile {
  fileId: string;
  kind: 'motion_package' | 'manifest' | 'preview_source';
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface PreviewAssetLicenseSummary {
  aggregateStatus: 'pending' | 'passed' | 'failed' | 'manual_review';
  assets: Array<{ assetId: string; kind: 'cover' | 'preview_video' | 'preview_image'; sha256: string; licenseName: string; sourceUrl: string | null; proofRef: string | null; reviewStatus: 'passed' | 'failed' | 'manual_review'; reviewNotes: string | null }>;
  unlicensedAssetIds: string[];
}

export interface LicenseProof {
  id: string;
  templateId: string;
  versionId: string;
  declarationVersion: string;
  declarationItems: Array<{ code: string; accepted: boolean; acceptedAt: UtcIso | null }>;
  signer: { name: string; accountId: string };
  signDate: string;
  proofFiles: Array<{ proofFileId: string; originalName: string; storageKey: string; sha256: string }>;
  proofLink: string | null;
  revision: number;
  urlAuthorityStatus: 'pending' | 'accepted' | 'rejected' | 'manual_review';
  capturedAt: UtcIso | null;
  pageSummary: string | null;
  screenshotSha256: string | null;
  reviewerId: string | null;
  reviewedAt: UtcIso | null;
  conflictFlag: boolean;
  verificationStatus: 'pending' | 'passed' | 'failed' | 'manual_review';
  /** Derived from canonical PreviewAsset rows; never accepted as client input. */
  previewAssetLicenseSummary: PreviewAssetLicenseSummary;
}

export interface OrderItem {
  templateId: string;
  versionId: string;
  licenseType: LicenseType;
  priceCents: MoneyMinor;
}

export interface Order {
  id: string;
  orderNo: string;
  buyerId: string;
  sellerId: string;
  templateId: string;
  versionId: string;
  licenseType: LicenseType;
  licensePriceFactor: string;
  priceCents: MoneyMinor;
  pricingCurrency: 'USD';
  paymentCurrency: 'USD' | 'USDT';
  paymentAmountMinor: MoneyMinor;
  quoteRate: { usdToUsdt: string; source: string; capturedAt: UtcIso } | null;
  quoteExpiresAt: UtcIso | null;
  quoteId: string | null;
  platformFeeCents: MoneyMinor;
  sellerAmountCents: MoneyMinor;
  taxSnapshot: Record<string, JsonValue>;
  refundPolicyVersion: string;
  refundPolicySnapshot: RefundPolicySnapshot;
  items: [OrderItem];
  paymentStatus: 'pending' | 'authorized' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
  orderStatus: 'created' | 'pending_payment' | 'paid' | 'fulfilled' | 'failed' | 'refunded';
  paidAt: UtcIso | null;
  createdAt: UtcIso;
  updatedAt: UtcIso;
}

export interface Entitlement {
  id: string;
  orderId: string;
  templateId: string;
  versionId: string;
  licenseType: LicenseType;
  maxDownloads: 10;
  downloadCount: number;
  expiresAt: UtcIso;
  status: EntitlementStatus;
  reissuedFromId: string | null;
  reissuedToId: string | null;
  revokeReasonPublic: string | null;
  revokeReasonInternal: string | null;
  createdAt: UtcIso;
  updatedAt: UtcIso;
}

export interface Complaint {
  id: string;
  orderId: string;
  entitlementId: string | null;
  templateId: string;
  versionId: string;
  reason: ComplaintReason;
  description: string;
  status: ComplaintStatus;
  reviewRoute: ReviewRoute;
  refundDecision: 'not_requested' | 'pending' | 'approved' | 'rejected';
  refundAmountUsdCents: MoneyMinor | null;
  timeline: Array<{ event: string; actorId: string | null; note: string | null; at: UtcIso }>;
  createdAt: UtcIso;
  updatedAt: UtcIso;
}

export interface PreviewAsset {
  id: string;
  templateId: string;
  versionId: string;
  kind: 'image' | 'video';
  revision: number;
  storageKey: string;
  url: string | null;
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  licenseName: string;
  licenseSource: string;
  licenseSourceUrl: string | null;
  licenseStatus: 'passed' | 'failed' | 'manual_review';
  proofRef: string | null;
  reviewerId: string | null;
  reviewedAt: UtcIso | null;
  reviewNotes: string | null;
  createdAt: UtcIso;
}

/** Future payment port contract; M0 does not expose a payment adapter. */
export interface ProofCapture {
  id: string;
  proofId: string;
  versionId: string;
  status: ProofCaptureStatus;
  outcome: ProofCaptureOutcome;
  errorCode: string | null;
  proofLink: string;
  finalUrl: string | null;
  sourceDomain: string | null;
  title: string | null;
  h1: string | null;
  pageSummary: string | null;
  responseSha256: string | null;
  screenshotSha256: string | null;
  capturedAt: UtcIso;
  history: Array<{ url: string; statusCode: number | null; at: UtcIso }>;
}
export interface PaymentTransaction {
  id: string;
  orderId: string;
  parentTransactionId: string | null;
  provider: string;
  type: 'payment' | 'refund';
  amountMinor: MoneyMinor;
  pricingAmountUsdCents: MoneyMinor;
  currency: 'USD' | 'USDT';
  eventId: string | null;
  status: 'pending' | 'succeeded' | 'failed';
  signatureVerified: boolean;
  chain: string | null;
  txHash: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  confirmations: number | null;
  requiredConfirmations: number | null;
  createdAt: UtcIso;
}

export interface AuditLog {
  id: string;
  actor: { type: 'user' | 'system'; id: string; emailSnapshot: string | null };
  action: string;
  targetType: string;
  targetId: string;
  diff: Array<{ field: string; before: unknown; after: unknown }>;
  reason: string | null;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  at: UtcIso;
}
