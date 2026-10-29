/** All money crossing a repository boundary uses safe integer minor units. */
export function moneyMinor(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Money must be a non-negative safe integer in minor units.');
  return value;
}
export const usdCents = moneyMinor;
export const usdtMicroUnits = moneyMinor;
export const CURRENCY_MINOR_UNITS = { USD: 100, USDT: 1_000_000 } as const;

export function decimalFactor(value: string): string {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || !/[1-9]/.test(value)) {
    throw new Error('A rate or factor must be a positive decimal string.');
  }
  return value;
}

/** Exact half-up rounding using integer arithmetic; never multiply money by a float. */
export function multiplyMinor(amount: number, factor: string): number {
  moneyMinor(amount);
  decimalFactor(factor);
  const [whole = '0', fraction = ''] = factor.split('.');
  const scale = 10n ** BigInt(fraction.length);
  const numerator = BigInt(amount) * BigInt(whole + fraction);
  const rounded = (numerator + scale / 2n) / scale;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Money exceeds the safe integer range.');
  return Number(rounded);
}
