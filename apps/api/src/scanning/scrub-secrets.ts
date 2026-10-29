import type { ScanFinding } from './scan-contracts.js';

export const TEXT_SCAN_LIMIT_BYTES = 1024 * 1024;
export const SCRUB_TIMEOUT_MS = 100;
export const REDACTED_VALUE = '[REDACTED_BY_PLATFORM]';

const textExtensions = new Set(['.json', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.md', '.markdown', '.txt', '.env', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.csv', '.xml', '.html', '.css', '.scss']);
const ordinaryPatterns: readonly RegExp[] = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /(["']?(?:api[_-]?key|access[_-]?token|secret|motiongit[_-]?key)["']?\s*[:=]\s*)(["']?)([^"'\r\n,}\s]+)(\2)/gi
];
const highRiskPatterns: readonly RegExp[] = [
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN(?: RSA| EC| OPENSSH)? PRIVATE KEY-----/g
];

export interface ScrubSecretsResult {
  text: string;
  findings: ScanFinding[];
  credentialCount: number;
  highRisk: boolean;
  timedOut: boolean;
  manualReview: boolean;
  truncated: boolean;
}

export function isTextFile(path: string): boolean {
  const lower = path.toLowerCase();
  const basename = lower.split('/').pop() ?? lower;
  return basename === '.env' || basename.startsWith('.env.') || [...textExtensions].some(extension => lower.endsWith(extension));
}

function snippet(text: string, start: number, end: number): string {
  return text.slice(Math.max(0, start - 30), Math.min(text.length, end + 30)).slice(0, 100);
}

function finding(code: string, path: string, severity: ScanFinding['severity'], message: string, contextSnippet?: string): ScanFinding {
  return { code, severity, path, message, ...(contextSnippet ? { contextSnippet } : {}) };
}

export function scrubSecrets(path: string, input: string, startedAt = Date.now()): ScrubSecretsResult {
  if (!isTextFile(path)) return { text: input, findings: [], credentialCount: 0, highRisk: false, timedOut: false, manualReview: false, truncated: false };
  const bytes = Buffer.from(input, 'utf8');
  const truncated = bytes.byteLength > TEXT_SCAN_LIMIT_BYTES;
  let text = bytes.subarray(0, TEXT_SCAN_LIMIT_BYTES).toString('utf8');
  const findings: ScanFinding[] = [];
  if (truncated) findings.push(finding('TEXT_FILE_TOO_LARGE', path, 'warning', 'Only the first 1 MiB of this text file was scanned.'));

  let highRisk = false;
  for (const pattern of highRiskPatterns) {
    pattern.lastIndex = 0;
    if (!pattern.test(text)) continue;
    highRisk = true;
    text = text.replace(pattern, REDACTED_VALUE);
  }
  if (highRisk) {
    findings.push(finding('HIGH_RISK_CREDENTIALS', path, 'critical', 'High-risk credentials were detected and the package was blocked.', REDACTED_VALUE));
    return { text, findings, credentialCount: 1, highRisk: true, timedOut: false, manualReview: false, truncated };
  }

  let credentialCount = 0;
  for (const pattern of ordinaryPatterns) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, (...args: unknown[]) => {
      const full = String(args[0]);
      const offset = Number(args[args.length - 2]);
      const isToken = full.startsWith('sk-');
      const replacement = isToken ? REDACTED_VALUE : `${String(args[1])}${String(args[2])}${REDACTED_VALUE}${String(args[4])}`;
      credentialCount++;
      findings.push(finding('CREDENTIALS_DETECTED', path, 'warning', 'A credential-like value was redacted before review.', REDACTED_VALUE));
      return replacement;
    });
    if (Date.now() - startedAt > SCRUB_TIMEOUT_MS) {
      findings.push(finding('SCRUB_TIMEOUT', path, 'warning', 'Secret scrubbing exceeded its time budget; the file requires manual review.'));
      return { text, findings, credentialCount, highRisk: false, timedOut: true, manualReview: true, truncated };
    }
  }
  if (credentialCount > 5) findings.push(finding('CREDENTIALS_TOO_MANY', path, 'critical', 'More than five credential-like values were detected; the package was blocked.'));
  let manualReview = false;
  if (!truncated && path.toLowerCase().endsWith('.json') && findings.some(item => item.code === 'CREDENTIALS_DETECTED')) {
    try { JSON.parse(text); } catch {
      findings.push(finding('SCRUB_JSON_INVALID', path, 'warning', 'Redaction changed JSON structure; manual review is required.'));
      manualReview = true;
    }
  }
  return { text, findings, credentialCount, highRisk: false, timedOut: false, manualReview, truncated };
}
