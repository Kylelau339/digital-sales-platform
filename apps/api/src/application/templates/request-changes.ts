import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import type { RequestChangesResult } from './request-changes-state.js';

export interface RequestChangesInput {
  versionId: string;
  expectedRevision: number;
  newVersionId: string;
  newVersion: string;
  actorId: string;
  reason: string;
}

export interface RequestChangesRepository {
  requestChanges(input: RequestChangesInput): Promise<RequestChangesResult>;
}

export async function requestChanges(repository: RequestChangesRepository, input: RequestChangesInput): Promise<RequestChangesResult> {
  const reason = input.reason.trim();
  if (reason.length < 8) throw new DomainError(ERROR_CODES.REASON_TOO_SHORT, 422, 'A reason of at least 8 characters is required.');
  if (!input.versionId.trim() || !input.newVersionId.trim() || !input.newVersion.trim() || input.newVersion.trim().length > 64 || !input.actorId.trim() || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
    throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 422, 'Invalid request changes input.');
  }
  return repository.requestChanges({ ...input, newVersion: input.newVersion.trim(), reason });
}
