import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function hashToken(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}
export function token(): string { return randomBytes(32).toString('base64url'); }
export function matchesToken(value: string, expectedHash: string, secret: string): boolean {
  const actual = Buffer.from(hashToken(value, secret), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
