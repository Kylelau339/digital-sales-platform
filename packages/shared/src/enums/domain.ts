/** Product lifecycle. `removed` is product-only and terminal. */
export const TEMPLATE_STATUSES = ['draft', 'pending_license_review', 'approved', 'suspended', 'removed', 'rejected'] as const;
export type TemplateStatus = typeof TEMPLATE_STATUSES[number];

export const TEMPLATE_VERSION_STATUSES = ['draft', 'pending_license_review', 'approved', 'rejected'] as const;
export type TemplateVersionStatus = typeof TEMPLATE_VERSION_STATUSES[number];

export const SCAN_STATUSES = ['pending', 'running', 'passed', 'failed', 'manual_review', 'timed_out'] as const;
export type ScanStatus = typeof SCAN_STATUSES[number];

export const PARSER_STATUSES = ['parsed', 'failed', 'unknown'] as const;
export type ParserStatus = typeof PARSER_STATUSES[number];

export const FINDING_SEVERITIES = ['info', 'warning', 'error', 'critical'] as const;
export type FindingSeverity = typeof FINDING_SEVERITIES[number];

export const SCAN_FINDING_CODES = [
  'ARCHIVE_TOO_LARGE', 'EXPANDED_TOO_LARGE', 'ENTRY_COUNT_EXCEEDED', 'SINGLE_ENTRY_TOO_LARGE', 'SCAN_TIMEOUT',
  'PATH_TRAVERSAL', 'ABSOLUTE_PATH', 'DUPLICATE_PATH', 'PATH_ALIAS', 'SYMLINK_ENTRY', 'SPECIAL_ENTRY', 'ZIP_BOMB',
  'MOTION_MANIFEST_MISSING', 'MOTION_MANIFEST_INVALID', 'EXECUTABLE_FILE', 'SCRIPT_FILE', 'MIME_MISMATCH',
  'LICENSE_FILE_MISSING', 'LICENSE_PARSE_CONFLICT', 'LICENSE_PARSER_UNKNOWN', 'ARCHIVE_INVALID'
] as const;
export type ScanFindingCode = typeof SCAN_FINDING_CODES[number];

export const REVIEW_BLOCKER_CODES = [
  'SCAN_NOT_FINISHED', 'SCAN_FAILED', 'SCAN_TIMED_OUT', 'SCAN_FINDING_PRESENT',
  'LICENSE_CONFLICT', 'LICENSE_UNKNOWN', 'LICENSE_PARSER_FAILED',
  'PROOF_MISSING', 'PROOF_REVIEW_PENDING', 'PROOF_REVIEW_FAILED',
  'PROOF_URL_CAPTURE_PENDING', 'PROOF_URL_CAPTURE_FAILED', 'PROOF_URL_AUTHORITY_PENDING', 'PROOF_URL_AUTHORITY_REJECTED',
  'PREVIEW_ASSET_MISSING', 'PREVIEW_LICENSE_REVIEW_PENDING', 'PREVIEW_LICENSE_FAILED',
  'VERSION_HASH_CHANGED', 'VERSION_NOT_IMMUTABLE', 'VERSION_NOT_CURRENT_REVIEW_TARGET'
] as const;
export type ReviewBlockerCode = typeof REVIEW_BLOCKER_CODES[number];

export const PROOF_CAPTURE_STATUSES = ['active', 'superseded'] as const;
export type ProofCaptureStatus = typeof PROOF_CAPTURE_STATUSES[number];
export const PROOF_CAPTURE_OUTCOMES = ['passed', 'failed', 'manual_review'] as const;
export type ProofCaptureOutcome = typeof PROOF_CAPTURE_OUTCOMES[number];

export const ENTITLEMENT_STATUSES = ['active', 'exhausted', 'expired', 'revoked', 'reissued'] as const;
export type EntitlementStatus = typeof ENTITLEMENT_STATUSES[number];

export const COMPLAINT_STATUSES = ['submitted', 'triaged', 'actioned', 'resolved', 'rejected'] as const;
export type ComplaintStatus = typeof COMPLAINT_STATUSES[number];

export const REVIEW_ROUTES = ['standard', 'manual_review'] as const;
export type ReviewRoute = typeof REVIEW_ROUTES[number];

export const COMPLAINT_REASONS = [
  'unauthorized_distribution',
  'copyright',
  'trademark',
  'malware',
  'misleading_license',
  'file_corrupted_or_inaccessible',
  'technical_unavailable',
  'materially_not_as_described',
  'duplicate_purchase',
  'other'
] as const;
export type ComplaintReason = typeof COMPLAINT_REASONS[number];

export const LICENSE_TYPES = [
  'commercial_single_project',
  'commercial_multi_project',
  'personal_use',
  'custom'
] as const;
export type LicenseType = typeof LICENSE_TYPES[number];

export const USER_ROLES = ['buyer', 'seller', 'admin'] as const;
export type UserRole = typeof USER_ROLES[number];

export const AUTH_STATUSES = ['pending_email', 'verified', 'locked', 'disabled'] as const;
export type AuthStatus = typeof AUTH_STATUSES[number];

export const PAYMENT_CURRENCIES = ['USD', 'USDT'] as const;
export type PaymentCurrency = typeof PAYMENT_CURRENCIES[number];

export const REFUND_ELIGIBLE_REASONS = [
  'file_corrupted_or_inaccessible',
  'materially_not_as_described',
  'duplicate_purchase'
] as const;

export const REFUND_EXCLUSIONS = ['already_downloaded', 'subjective_dissatisfaction'] as const;
export const REFUND_WINDOW_EXEMPT_REASONS = ['technical_unavailable', 'file_corrupted_or_inaccessible'] as const;

export const TERMINAL_ENTITLEMENT_STATUSES = ['exhausted', 'expired', 'revoked', 'reissued'] as const;

export const PAYMENT_STATUSES = ['pending', 'authorized', 'paid', 'failed', 'refunded', 'partially_refunded'] as const;
export const ORDER_STATUSES = ['created', 'pending_payment', 'paid', 'fulfilled', 'failed', 'refunded'] as const;
export const FILE_KINDS = ['motion_package', 'manifest', 'preview_source'] as const;
export const VERIFICATION_STATUSES = ['pending', 'passed', 'failed', 'manual_review'] as const;
export const URL_AUTHORITY_STATUSES = ['pending', 'accepted', 'rejected', 'manual_review'] as const;
export const PREVIEW_LICENSE_STATUSES = ['passed', 'failed', 'manual_review'] as const;
export const PREVIEW_KINDS = ['image', 'video'] as const;
export const REFUND_DECISIONS = ['not_requested', 'pending', 'approved', 'rejected'] as const;
export const TRANSACTION_TYPES = ['payment', 'refund'] as const;
export const TRANSACTION_STATUSES = ['pending', 'succeeded', 'failed'] as const;
export const DEFAULT_ENTITLEMENT_EXPIRY_DAYS = 365;
export const MAX_ENTITLEMENT_DOWNLOADS = 10;

/** Removed is terminal; rejected submissions must return to draft before resubmission. */
export const TEMPLATE_TRANSITIONS: Readonly<Record<TemplateStatus, readonly TemplateStatus[]>> = {
  draft: ['pending_license_review', 'removed'],
  pending_license_review: ['approved', 'rejected', 'removed'],
  approved: ['suspended', 'removed'],
  suspended: ['approved', 'removed'],
  rejected: ['draft', 'removed'],
  removed: []
};
