import type { ReviewBlockerCode } from '@shared/enums/domain.js';

export interface ReviewSnapshot {
  reviewTargetVersionId: string | null;
  versionId: string;
  versionRevision: number;
  versionStatus: 'draft' | 'pending_license_review' | 'approved' | 'rejected';
  immutable: boolean;
  scanStatus: 'pending' | 'running' | 'passed' | 'failed' | 'manual_review' | 'timed_out';
  scanFindings: Array<{ severity: string; code: string }>;
  parserStatus: 'parsed' | 'failed' | 'unknown';
  conflictFlag: boolean;
  proof?: {
    id: string;
    revision: number;
    hasFile: boolean;
    hasUrl: boolean;
    fileReviewStatus: 'pending' | 'passed' | 'failed';
    verificationStatus: 'pending' | 'passed' | 'failed' | 'manual_review';
    urlAuthorityStatus: 'pending' | 'accepted' | 'rejected' | 'manual_review';
    captureOutcome: 'passed' | 'failed' | 'manual_review' | null;
  } | null;
  previewAssets: Array<{ id: string; revision: number; licenseStatus: 'passed' | 'failed' | 'manual_review' }>;
  hashMatches: boolean;
}

export function deriveBlockers(review: ReviewSnapshot): { blockers: ReviewBlockerCode[]; canApprove: boolean } {
  const blockers = new Set<ReviewBlockerCode>();
  if (review.reviewTargetVersionId !== review.versionId || review.versionStatus !== 'pending_license_review') blockers.add('VERSION_NOT_CURRENT_REVIEW_TARGET');
  if (!review.immutable) blockers.add('VERSION_NOT_IMMUTABLE');
  if (review.scanStatus === 'failed') blockers.add('SCAN_FAILED');
  else if (review.scanStatus === 'timed_out') blockers.add('SCAN_TIMED_OUT');
  else if (review.scanStatus !== 'passed') blockers.add('SCAN_NOT_FINISHED');
  if (review.scanFindings.some(f => f.severity === 'error' || f.severity === 'critical' || !['info', 'warning'].includes(f.severity))) blockers.add('SCAN_FINDING_PRESENT');
  if (review.conflictFlag) blockers.add('LICENSE_CONFLICT');
  if (review.parserStatus === 'failed') blockers.add('LICENSE_PARSER_FAILED');
  else if (review.parserStatus !== 'parsed') blockers.add('LICENSE_UNKNOWN');
  const proof = review.proof;
  if (!proof || (!proof.hasFile && !proof.hasUrl)) blockers.add('PROOF_MISSING');
  if (proof) {
    if (proof.verificationStatus === 'failed' || (proof.hasFile && proof.fileReviewStatus === 'failed')) blockers.add('PROOF_REVIEW_FAILED');
    if ((proof.verificationStatus !== 'passed' && proof.verificationStatus !== 'failed') || (proof.hasFile && proof.fileReviewStatus !== 'passed' && proof.fileReviewStatus !== 'failed')) blockers.add('PROOF_REVIEW_PENDING');
    if (proof.hasUrl) {
      if (proof.captureOutcome === 'failed') blockers.add('PROOF_URL_CAPTURE_FAILED');
      else if (proof.captureOutcome !== 'passed') blockers.add('PROOF_URL_CAPTURE_PENDING');
      if (proof.urlAuthorityStatus === 'rejected') blockers.add('PROOF_URL_AUTHORITY_REJECTED');
      else if (proof.urlAuthorityStatus !== 'accepted') blockers.add('PROOF_URL_AUTHORITY_PENDING');
    }
  }
  if (!review.previewAssets.length) blockers.add('PREVIEW_ASSET_MISSING');
  if (review.previewAssets.some(a => a.licenseStatus === 'failed')) blockers.add('PREVIEW_LICENSE_FAILED');
  if (review.previewAssets.some(a => a.licenseStatus !== 'passed' && a.licenseStatus !== 'failed')) blockers.add('PREVIEW_LICENSE_REVIEW_PENDING');
  if (!review.hashMatches) blockers.add('VERSION_HASH_CHANGED');
  const result = [...blockers];
  return { blockers: result, canApprove: result.length === 0 };
}
