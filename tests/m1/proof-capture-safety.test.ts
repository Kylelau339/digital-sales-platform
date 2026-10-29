import { describe, expect, it } from 'vitest';
import { isPublicIp, normalizeHtml, validateUrl } from '../../apps/api/src/proof/capture.js';

describe('M1 proof URL capture safety', () => {
  it.each(['http://example.com/x', 'file:///tmp/x', 'https://user:pass@example.com/x', 'https://localhost/x', 'https://127.0.0.1/x'])('rejects unsafe URL: %s', value => expect(() => validateUrl(value)).toThrow());
  it('rejects private and accepts ordinary public IP classes', () => { expect(isPublicIp('127.0.0.1')).toBe(false); expect(isPublicIp('10.0.0.1')).toBe(false); expect(isPublicIp('8.8.8.8')).toBe(true); expect(isPublicIp('::1')).toBe(false); });
  it('normalizes visible HTML text, title and h1 under 2000 characters', () => { const result = normalizeHtml('<html><head><title> Rights page </title><style>hidden</style></head><body><script>bad()</script><h1>Official rights</h1><p aria-hidden="true">secret</p><p>Visible   text</p></body></html>'); expect(result.title).toBe('Rights page'); expect(result.h1).toBe('Official rights'); expect(result.pageSummary).toBe('Official rights Visible text'); });
  it('truncates summaries', () => expect(normalizeHtml(`<body>${'x'.repeat(2500)}</body>`).pageSummary).toHaveLength(2000));
});
