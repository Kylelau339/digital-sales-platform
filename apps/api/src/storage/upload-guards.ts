import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
export function assertPreviewUploadContentType(contentType: string | undefined): void {
  if ((contentType ?? '').toLowerCase().split(';', 1)[0] === 'video/*' || (contentType ?? '').toLowerCase().startsWith('video/')) throw new DomainError(ERROR_CODES.VIDEO_UPLOAD_NOT_SUPPORTED, 422, 'Video preview uploads are not supported in M1.');
}
