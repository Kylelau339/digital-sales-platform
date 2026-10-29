export function readPreference(key: string, fallback: string): string {
  try { return typeof window === 'undefined' ? fallback : window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
export function savePreference(key: string, value: string) { try { window.localStorage.setItem(key, value); } catch { /* Preferences are optional when storage is unavailable. */ } }
