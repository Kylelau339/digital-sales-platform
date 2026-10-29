import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import * as cheerio from 'cheerio';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';

const MAX_BODY = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const CONNECT_TIMEOUT = 3000;
const TOTAL_TIMEOUT = 8000;

type HistoryEntry = { url: string; statusCode: number | null; at: string };
export interface CaptureResult {
  outcome: 'passed' | 'failed' | 'manual_review';
  errorCode: string | null;
  proofLink: string;
  finalUrl: string | null;
  sourceDomain: string | null;
  title: string | null;
  h1: string | null;
  pageSummary: string | null;
  responseSha256: string | null;
  screenshotSha256: null;
  capturedAt: string;
  history: HistoryEntry[];
}

function result(proofLink: string, capturedAt: string, patch: Partial<CaptureResult>): CaptureResult {
  return { outcome: 'manual_review', errorCode: null, proofLink, finalUrl: null, sourceDomain: null, title: null, h1: null, pageSummary: null, responseSha256: null, screenshotSha256: null, capturedAt, history: [], ...patch };
}

function ipv4Parts(ip: string): number[] | null {
  if (isIP(ip) !== 4) return null;
  const parts = ip.split('.').map(Number);
  return parts.length === 4 && parts.every(value => Number.isInteger(value) && value >= 0 && value <= 255) ? parts : null;
}

function isPublicIp(ip: string): boolean {
  const v4 = ipv4Parts(ip);
  if (v4) {
    const [a, b] = v4 as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0) return false;
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
    if (a === 203 && b === 0) return false;
    return true;
  }
  if (isIP(ip) !== 6) return false;
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return false;
  if (normalized.startsWith('ff')) return false;
  if (normalized.startsWith('::ffff:')) return isPublicIp(normalized.slice(7));
  return true;
}

function validateUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new DomainError(ERROR_CODES.PROOF_URL_UNSAFE, 422, 'Proof URL is invalid.'); }
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password || url.hash) throw new DomainError(ERROR_CODES.PROOF_URL_UNSAFE, 422, 'Proof URL must use public HTTPS without credentials.');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost') || (isIP(host) !== 0 && !isPublicIp(host))) throw new DomainError(ERROR_CODES.PROOF_URL_UNSAFE, 422, 'Private proof host is not allowed.');
  return url;
}

async function publicAddresses(hostname: string): Promise<string[]> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  const values = addresses.map(item => item.address);
  if (!values.length || values.some(address => !isPublicIp(address))) throw new DomainError(ERROR_CODES.PROOF_URL_UNSAFE, 422, 'Proof host resolves to a non-public address.');
  return values;
}

function normalizeHtml(source: string): { title: string | null; h1: string | null; pageSummary: string | null } {
  const $ = cheerio.load(source);
  $('script,style,noscript,template,iframe,svg').remove();
  $('[aria-hidden="true"]').remove();
  $('[style]').each((_index, node) => {
    const style = ($(node).attr('style') ?? '').replace(/\s+/g, '').toLowerCase();
    if (style.includes('display:none') || style.includes('visibility:hidden')) $(node).remove();
  });
  const clean = (value: string | undefined): string | null => {
    const text = (value ?? '').replace(/\s+/gu, ' ').trim();
    return text ? text.slice(0, 2000) : null;
  };
  return { title: clean($('title').first().text()), h1: clean($('h1').first().text()), pageSummary: clean($('body').contents().toArray().map(node => $(node).text()).join(' ')) };
}

function fetchOnce(url: URL, proofLink: string, capturedAt: string, history: HistoryEntry[], deadline: number): Promise<CaptureResult | { redirect: URL }> {
  return new Promise(async resolve => {
    let addresses: string[];
    try { addresses = await publicAddresses(url.hostname); } catch (error) {
      const code = error instanceof DomainError ? error.code : ERROR_CODES.PROOF_CAPTURE_FAILED;
      resolve(result(proofLink, capturedAt, { errorCode: code, sourceDomain: url.hostname, history })); return;
    }
    const request = httpsRequest(url, {
      method: 'GET',
      headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' },
      timeout: CONNECT_TIMEOUT,
      servername: url.hostname,
      lookup: (_hostname, _options, callback) => callback(null, addresses[0]!, isIP(addresses[0]!))
    }, response => {
      const status = response.statusCode ?? 0;
      history.push({ url: url.toString(), statusCode: status, at: new Date().toISOString() });
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.resume();
        if (!location) { resolve(result(proofLink, capturedAt, { errorCode: ERROR_CODES.PROOF_CAPTURE_FAILED, sourceDomain: url.hostname, history })); return; }
        try { const next = validateUrl(new URL(location, url).toString()); resolve({ redirect: next }); } catch { resolve(result(proofLink, capturedAt, { errorCode: ERROR_CODES.PROOF_URL_UNSAFE, sourceDomain: url.hostname, history })); }
        return;
      }
      const type = String(response.headers['content-type'] ?? '').toLowerCase();
      if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) { response.resume(); resolve(result(proofLink, capturedAt, { errorCode: ERROR_CODES.PROOF_CAPTURE_NON_HTML, finalUrl: url.toString(), sourceDomain: url.hostname, history })); return; }
      const chunks: Buffer[] = []; let size = 0; let tooLarge = false;
      response.on('data', chunk => { size += chunk.length; if (size > MAX_BODY) { tooLarge = true; response.destroy(); } else chunks.push(chunk); });
      response.on('end', () => {
        if (tooLarge) { resolve(result(proofLink, capturedAt, { errorCode: ERROR_CODES.PROOF_CAPTURE_FAILED, finalUrl: url.toString(), sourceDomain: url.hostname, history })); return; }
        const body = Buffer.concat(chunks); const summary = normalizeHtml(body.toString('utf8'));
        resolve({ outcome: 'passed', errorCode: null, proofLink, finalUrl: url.toString(), sourceDomain: url.hostname, ...summary, responseSha256: createHash('sha256').update(body).digest('hex'), screenshotSha256: null, capturedAt, history });
      });
    });
    const remaining = Math.max(1, deadline - Date.now());
    const timer = setTimeout(() => { request.destroy(); resolve(result(proofLink, capturedAt, { errorCode: ERROR_CODES.PROOF_CAPTURE_TIMEOUT, finalUrl: null, sourceDomain: url.hostname, history })); }, remaining);
    request.on('socket', socket => { socket.setTimeout(Math.min(CONNECT_TIMEOUT, remaining)); socket.once('connect', () => { const remote = socket.remoteAddress; if (!remote || !isPublicIp(remote)) request.destroy(new Error('Non-public peer.')); }); });
    request.on('timeout', () => { request.destroy(new Error('Timeout')); });
    request.on('error', () => { clearTimeout(timer); resolve(result(proofLink, capturedAt, { errorCode: ERROR_CODES.PROOF_CAPTURE_FAILED, sourceDomain: url.hostname, history })); });
    request.once('close', () => clearTimeout(timer)); request.end();
  });
}

export async function captureProofUrl(proofLink: string): Promise<CaptureResult> {
  const capturedAt = new Date().toISOString();
  let current: URL;
  try { current = validateUrl(proofLink); } catch (error) { return result(proofLink, capturedAt, { errorCode: error instanceof DomainError ? error.code : ERROR_CODES.PROOF_URL_UNSAFE }); }
  const history: HistoryEntry[] = []; const deadline = Date.now() + TOTAL_TIMEOUT;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const response = await fetchOnce(current, proofLink, capturedAt, history, deadline);
    if (!('redirect' in response)) return response;
    if (redirect === MAX_REDIRECTS) return result(proofLink, capturedAt, { errorCode: ERROR_CODES.PROOF_CAPTURE_FAILED, sourceDomain: current.hostname, history });
    current = response.redirect;
  }
  return result(proofLink, capturedAt, { errorCode: ERROR_CODES.PROOF_CAPTURE_FAILED, history });
}

export { isPublicIp, normalizeHtml, validateUrl };
