import { describe, expect, it } from 'vitest';
import { scrubSecrets, REDACTED_VALUE, TEXT_SCAN_LIMIT_BYTES } from '../../apps/api/src/scanning/scrub-secrets.js';

describe('secret scrubbing', () => {
  it('redacts ordinary credentials and preserves JSON structure', () => {
    const result = scrubSecrets('motion.json', JSON.stringify({ api_key: 'sk-' + 'a'.repeat(40), nested: true }));
    expect(result.text).toContain(REDACTED_VALUE);
    expect(JSON.parse(result.text)).toEqual({ api_key: REDACTED_VALUE, nested: true });
    expect(result.findings.map(item => item.code)).toContain('CREDENTIALS_DETECTED');
    expect(result.findings[0]?.contextSnippet).not.toContain('sk-');
  });
  it('does not leak adjacent credentials in any finding', () => {
    const result = scrubSecrets('motion.json', JSON.stringify({ api_key: 'sk-original-secret', access_token: 'another-secret' }));
    expect(result.findings.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.findings)).not.toContain('sk-original-secret');
    expect(JSON.stringify(result.findings)).not.toContain('another-secret');
    expect(JSON.parse(result.text)).toEqual({ api_key: REDACTED_VALUE, access_token: REDACTED_VALUE });
  });
  it('blocks AWS and private-key credentials without retaining the secret', () => {
    const result = scrubSecrets('config.txt', 'AWS=AKIA1234567890ABCDEF\n-----BEGIN PRIVATE KEY-----');
    expect(result.highRisk).toBe(true);
    expect(result.findings.map(item => item.code)).toContain('HIGH_RISK_CREDENTIALS');
    expect(result.text).not.toContain('AKIA');
    expect(result.text).not.toContain('BEGIN PRIVATE KEY');
  });
  it('limits text scanning to the first MiB and does not block oversized text', () => {
    const result = scrubSecrets('notes.txt', 'x'.repeat(TEXT_SCAN_LIMIT_BYTES + 100));
    expect(result.truncated).toBe(true);
    expect(result.findings.map(item => item.code)).toContain('TEXT_FILE_TOO_LARGE');
    expect(result.highRisk).toBe(false);
  });
  it('does not scrub binary files', () => {
    const result = scrubSecrets('image.bin', 'api_key=secret');
    expect(result.text).toBe('api_key=secret');
    expect(result.findings).toEqual([]);
  });
});
