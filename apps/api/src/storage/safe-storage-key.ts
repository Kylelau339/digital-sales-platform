import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/;

export function assertSafeStorageKey(key: string): string {
  if (!SAFE_KEY.test(key) || key.includes('\\') || key.includes('//') || key.startsWith('/') || key.includes('/./') || key.includes('/../') || key.endsWith('/.') || key.endsWith('/..')) {
    throw new DomainError(ERROR_CODES.STORAGE_KEY_INVALID, 422, 'Storage key is not safe.');
  }
  const parts = key.split('/');
  if (parts.some(part => part === '' || part === '.' || part === '..')) throw new DomainError(ERROR_CODES.STORAGE_KEY_INVALID, 422, 'Storage key is not safe.');
  return key;
}
