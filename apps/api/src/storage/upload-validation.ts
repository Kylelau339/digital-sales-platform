import sharp from 'sharp';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';

export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export interface ValidatedUpload { bytes: Buffer; mimeType: string; extension: string; }
function bad(message: string): never { throw new DomainError(ERROR_CODES.PREVIEW_ASSET_INVALID, 422, message); }
function detected(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}
export function validateProofFile(bytes: Buffer, declaredMime: string): ValidatedUpload {
  if (!bytes.length || bytes.length > EVIDENCE_MAX_BYTES) throw new DomainError(ERROR_CODES.PROOF_FILE_INVALID, 422, 'Proof files must be between 1 byte and 10 MiB.');
  const mime = detected(bytes);
  if (!mime || !['application/pdf', 'image/png', 'image/jpeg'].includes(mime) || mime !== declaredMime) throw new DomainError(ERROR_CODES.PROOF_FILE_INVALID, 422, 'Proof type must match PDF, PNG, or JPEG content.');
  return { bytes, mimeType: mime, extension: mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg' };
}
export async function normalizePreviewImage(bytes: Buffer, declaredMime: string): Promise<ValidatedUpload> {
  if (!bytes.length || bytes.length > EVIDENCE_MAX_BYTES) bad('Preview images must be between 1 byte and 10 MiB.');
  const mime = detected(bytes);
  if (!mime || !['image/jpeg', 'image/png', 'image/webp'].includes(mime) || mime !== declaredMime) bad('Preview type must match JPEG, PNG, or WebP content.');
  try {
    const image = sharp(bytes, { limitInputPixels: 4096 * 4096, animated: false, failOn: 'error' });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096 || (metadata.pages ?? 1) > 1) bad('Preview images must be still images no larger than 4096×4096.');
    const output = await image.rotate().webp({ quality: 90 }).toBuffer();
    return { bytes: output, mimeType: 'image/webp', extension: 'webp' };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    bad('Preview image cannot be decoded safely.');
  }
}
