export function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

export function json(value: unknown): string {
  return JSON.stringify(value);
}
