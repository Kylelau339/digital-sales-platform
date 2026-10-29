import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import { deriveBlockers, type ReviewSnapshot } from './review-blockers.js';

export interface ReviewFile { fileId: string; storageKey: string; sha256: string; }
export interface ApprovalSnapshot { review: ReviewSnapshot; files: ReviewFile[]; }
export interface ApprovalTransaction {
  load(versionId: string): Promise<ApprovalSnapshot | null>;
  approve(snapshot: ApprovalSnapshot, actorId: string, reason: string): Promise<void>;
}
export interface ApprovalRepository {
  load(versionId: string): Promise<ApprovalSnapshot | null>;
  transaction<T>(work: (transaction: ApprovalTransaction) => Promise<T>): Promise<T>;
}

function changed(): DomainError {
  return new DomainError(ERROR_CODES.REVIEW_BLOCKERS_PRESENT, 409, 'Review changed while approval was in progress.');
}
function assertApprovable(review: ReviewSnapshot): void {
  const result = deriveBlockers(review);
  if (!result.canApprove) throw new DomainError(ERROR_CODES.REVIEW_BLOCKERS_PRESENT, 409, 'Review blockers remain.', { blockers: result.blockers });
}

/** The verifier must inspect the supplied files and return false on any missing or mismatched file. */
export async function approveReview(repository: ApprovalRepository, input: {
  versionId: string; actorId: string; reason: string;
  verifyHashes: (files: readonly ReviewFile[]) => Promise<boolean>;
}): Promise<{ versionId: string; status: 'approved' }> {
  const snapshot = await repository.load(input.versionId);
  if (!snapshot) throw new DomainError(ERROR_CODES.REVIEW_NOT_FOUND, 404, 'Review not found.');
  snapshot.review.hashMatches = snapshot.files.length > 0 && await input.verifyHashes(snapshot.files);
  assertApprovable(snapshot.review);
  await repository.transaction(async transaction => {
    const current = await transaction.load(input.versionId);
    if (!current) throw changed();
    current.review.hashMatches = snapshot.review.hashMatches;
    if (JSON.stringify(current) !== JSON.stringify(snapshot)) throw changed();
    assertApprovable(current.review);
    await transaction.approve(current, input.actorId, input.reason);
  });
  return { versionId: input.versionId, status: 'approved' };
}
