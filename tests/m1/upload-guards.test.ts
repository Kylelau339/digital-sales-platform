import { describe, expect, it } from 'vitest';
import { assertPreviewUploadContentType } from '../../apps/api/src/storage/upload-guards.js';

describe('M1 upload guards', () => {
  it('rejects video before multipart parsing', () => expect(() => assertPreviewUploadContentType('video/mp4; boundary=x')).toThrowError(/Video/));
  it('allows image multipart content types to proceed to magic sniffing', () => expect(() => assertPreviewUploadContentType('multipart/form-data; boundary=x')).not.toThrow());
});
