import { Worker } from 'node:worker_threads';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ScanFinding, ScanJobContract } from './scan-contracts.js';
import { M1_SCAN_LIMITS } from './scan-contracts.js';

export interface ScanInput { id: string; versionId: string; filename: string; data: Uint8Array; createdAt: string; }
export interface ScanFileInput { id: string; versionId: string; filename: string; archivePath: string; createdAt: string; tempRoot?: string; onCleaned?: (bytes: Buffer) => Promise<void>; }
export interface ScanResult extends Omit<ScanJobContract, 'completedAt'> { completedAt: string | null; }
const structural = new Set(['ARCHIVE_TOO_LARGE','EXPANDED_TOO_LARGE','ENTRY_COUNT_EXCEEDED','SINGLE_ENTRY_TOO_LARGE','SCAN_TIMEOUT','PATH_TRAVERSAL','ABSOLUTE_PATH','DUPLICATE_PATH','PATH_ALIAS','SYMLINK_ENTRY','SPECIAL_ENTRY','ZIP_BOMB','MOTION_MANIFEST_MISSING','MOTION_MANIFEST_INVALID','EXECUTABLE_FILE','SCRIPT_FILE','MIME_MISMATCH','LICENSE_FILE_MISSING','ARCHIVE_INVALID','HIGH_RISK_CREDENTIALS','CREDENTIALS_TOO_MANY']);

export async function scanArchiveFile(input: ScanFileInput): Promise<ScanResult> {
  const tempDir = await mkdtemp(join(input.tempRoot ?? tmpdir(), 'motion-scan-'));
  let worker: Worker | undefined;
  const result = (status: ScanResult['status'], findings: ScanFinding[], packageLicense: ScanResult['packageLicense'] = null): ScanResult => ({ id: input.id, versionId: input.versionId, status, findings, packageLicense, createdAt: input.createdAt, completedAt: new Date().toISOString() });
  try {
    const typescript = import.meta.url.endsWith('.ts');
    const workerUrl = new URL(typescript ? './scan-worker.ts' : './scan-worker.js', import.meta.url);
    worker = new Worker(workerUrl, { workerData: { archivePath: input.archivePath, filename: input.filename, tempDir }, ...(typescript ? { execArgv: ['--import', 'tsx'] } : {}) });
    const current = worker;
    const scanResult = await new Promise<ScanResult>(resolve => {
      let settled = false;
      const finish = (value: ScanResult) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
      const timer = setTimeout(() => finish(result('timed_out', [{ code: 'SCAN_TIMEOUT', severity: 'critical', path: null, message: 'Scan timeout.' }])), M1_SCAN_LIMITS.timeoutMs);
      current.once('message', (message: { findings: ScanFinding[]; packageLicense: ScanResult['packageLicense'] }) => finish(result(message.findings.some(item => structural.has(item.code) && (item.severity === 'error' || item.severity === 'critical')) ? 'failed' : message.findings.some(item => item.code === 'SCRUB_JSON_INVALID' || item.code === 'SCRUB_TIMEOUT' || item.code === 'SCRUB_INCOMPLETE') ? 'manual_review' : 'passed', message.findings, message.packageLicense)));
      current.once('error', () => finish(result('failed', [{ code: 'ARCHIVE_INVALID', severity: 'critical', path: null, message: 'Scan worker failed.' }])));
      current.once('exit', code => finish(result('failed', [{ code: 'ARCHIVE_INVALID', severity: 'critical', path: null, message: `Scan worker exited (${code}).` }])));
    });
    if (scanResult.status === 'passed' && input.onCleaned) await input.onCleaned(await readFile(join(tempDir, 'cleaned.zip')));
    return scanResult;
  } catch {
    return result('failed', [{ code: 'ARCHIVE_INVALID', severity: 'critical', path: null, message: 'Scan failed.' }]);
  } finally {
    try { if (worker) await worker.terminate(); } finally { await rm(tempDir, { recursive: true, force: true }); }
  }
}

/** @deprecated Prefer scanArchiveFile for file-backed, bounded-memory scanning. */
export async function scanArchive(input: ScanInput): Promise<ScanResult> {
  const dir = await mkdtemp(join(tmpdir(), 'motion-input-'));
  try {
    const path = join(dir, 'archive.zip');
    await writeFile(path, input.data, { flag: 'wx' });
    return await scanArchiveFile({ id: input.id, versionId: input.versionId, filename: input.filename, createdAt: input.createdAt, archivePath: path });
  } finally { await rm(dir, { recursive: true, force: true }); }
}

export class ScanQueue {
  private active = 0;
  private readonly pending: Array<{ input: ScanInput; resolve: (result: ScanResult) => void; reject: (error: unknown) => void }> = [];
  enqueue(input: ScanInput): Promise<ScanResult> { return new Promise((resolve, reject) => { this.pending.push({ input, resolve, reject }); this.pump(); }); }
  private pump(): void { while (this.active < M1_SCAN_LIMITS.concurrency && this.pending.length) { const next = this.pending.shift()!; this.active++; void scanArchive(next.input).then(next.resolve, next.reject).finally(() => { this.active--; this.pump(); }); } }
}
