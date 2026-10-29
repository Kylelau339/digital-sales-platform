import { randomUUID } from 'node:crypto';

const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

/** Accept timezone-aware ISO timestamps and persist one UTC representation. */
export function normalizeUtcIso(value: string): string {
  if (!timestamp.test(value)) throw new Error('Expected a timezone-aware ISO timestamp.');
  const local = value.slice(0, 19);
  const calendar = new Date(`${local}Z`);
  const time = Date.parse(value);
  if (!Number.isFinite(time) || !Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 19) !== local) {
    throw new Error('Expected a valid ISO timestamp.');
  }
  return new Date(time).toISOString();
}

export function nowUtc(): string { return new Date().toISOString(); }

export function plusDays(iso: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new Error('Days must be a safe integer.');
  const result = Date.parse(normalizeUtcIso(iso)) + days * 86_400_000;
  if (!Number.isSafeInteger(result)) throw new Error('Timestamp arithmetic exceeds the safe range.');
  return new Date(result).toISOString();
}

export function id(prefix: string): string { return `${prefix}_${randomUUID()}`; }
export function assertUtcIso(value: string): void { normalizeUtcIso(value); }
