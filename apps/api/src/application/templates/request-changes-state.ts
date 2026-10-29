import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import type { TemplateProduct, TemplateVersion } from '@shared/contracts/domain.js';

export interface RequestChangesResult { oldVersionId: string; oldVersionStatus: TemplateVersion['status']; newVersionId: string; newVersionStatus: 'draft'; templateStatus: TemplateProduct['status']; currentVersionId: string | null; currentVersionStatus: TemplateVersion['status'] | null; }
export function requestChangesState(product: TemplateProduct, oldVersion: TemplateVersion, newVersionId: string): RequestChangesResult {
  if (oldVersion.templateId !== product.id) throw new DomainError(ERROR_CODES.VERSION_NOT_FOUND, 404, 'Version does not belong to product.');
  if (oldVersion.status !== 'pending_license_review' && oldVersion.status !== 'approved') throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Version is not eligible for changes.');
  const currentVersionId = product.currentVersionId;
  const currentVersionStatus = currentVersionId ? (currentVersionId === oldVersion.versionId && oldVersion.status === 'approved' ? 'approved' : 'approved') : null;
  const oldVersionStatus = oldVersion.status === 'approved' && currentVersionId === oldVersion.versionId ? 'approved' : 'rejected';
  const templateStatus = currentVersionId ? product.status : 'draft';
  return { oldVersionId: oldVersion.versionId, oldVersionStatus, newVersionId, newVersionStatus: 'draft', templateStatus, currentVersionId, currentVersionStatus };
}
