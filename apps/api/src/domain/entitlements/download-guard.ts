import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import type { Entitlement } from '@shared/contracts/domain.js';
import { timestampSchema, validate } from '@shared/schemas/domain.js';

export function assertCanDownload(entitlement: Entitlement, now: string): void {
  now = validate(timestampSchema, now);
  const expiresAt = validate(timestampSchema, entitlement.expiresAt);
  if (entitlement.status === 'reissued') throw new DomainError(ERROR_CODES.ENTITLEMENT_REISSUED, 409, 'This entitlement was replaced by a reissued entitlement.');
  if (entitlement.status === 'revoked') throw new DomainError(ERROR_CODES.ENTITLEMENT_REVOKED, 409, 'This entitlement has been revoked.');
  if (entitlement.status === 'expired' || Date.parse(expiresAt) <= Date.parse(now)) throw new DomainError(ERROR_CODES.ENTITLEMENT_EXPIRED, 409, 'This entitlement has expired.');
  if (entitlement.status === 'exhausted' || entitlement.downloadCount >= entitlement.maxDownloads) throw new DomainError(ERROR_CODES.ENTITLEMENT_EXHAUSTED, 409, 'This entitlement has no downloads remaining.');
  if (entitlement.status !== 'active') throw new DomainError(ERROR_CODES.ENTITLEMENT_REVOKED, 409, 'This entitlement cannot be downloaded.');
}
