import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { validateProofFile, normalizePreviewImage, EVIDENCE_MAX_BYTES } from '../../apps/api/src/storage/upload-validation.js';

describe('M1 private upload validation', () => {
  it('rejects executable bytes even when content type claims PDF', () => expect(() => validateProofFile(Buffer.from('MZ-not-a-pdf'), 'application/pdf')).toThrow());
  it('accepts a real PDF signature only with the matching type', () => expect(validateProofFile(Buffer.from('%PDF-1.7\n'), 'application/pdf').mimeType).toBe('application/pdf'));
  it('rejects proof files above 10 MiB', () => expect(() => validateProofFile(Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(EVIDENCE_MAX_BYTES)]), 'application/pdf')).toThrow());
  it('re-encodes preview images, strips metadata, and changes the digest', async () => {
    const input = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 20, g: 40, b: 60 } } }).withMetadata({ exif: { IFD0: { Artist: 'test' } } }).png().toBuffer();
    const result = await normalizePreviewImage(input, 'image/png');
    expect(result.mimeType).toBe('image/webp');
    expect(result.bytes.equals(input)).toBe(false);
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.width).toBe(10);
    expect(metadata.height).toBe(10);
    expect(metadata.exif).toBeUndefined();
  });
  it('rejects preview images over 4096 pixels', async () => {
    const input = await sharp({ create: { width: 4097, height: 1, channels: 3, background: 'white' } }).png().toBuffer();
    await expect(normalizePreviewImage(input, 'image/png')).rejects.toThrow();
  });
});
