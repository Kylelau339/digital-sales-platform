import { parentPort, workerData } from 'node:worker_threads';
import { constants, createWriteStream } from 'node:fs';
import { open, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { mergeLicenseTexts, readmeLicenseSections } from './license-parser.js';
import { M1_SCAN_LIMITS, ZIP_MAX_COMPRESSION_RATIO, ZIP_RATIO_THRESHOLD_BYTES } from './scan-limits.js';
import type { PackageLicense } from '@shared/contracts/domain.js';
import { scrubSecrets, isTextFile, TEXT_SCAN_LIMIT_BYTES } from './scrub-secrets.js';
import type { ScanFinding } from './scan-contracts.js';

interface Entry { name: string; zipEntry: yauzl.Entry; directory: boolean; }
interface Result { findings: ScanFinding[]; packageLicense: PackageLicense | null; }
const f = (code: string, severity: ScanFinding['severity'], _path: string | null, message: string): ScanFinding => ({ code, severity, path: null, message });
const executable = /\.(exe|dll|so|dylib|com|scr|msi|bin)$/i;
const script = /\.(js|mjs|cjs|ts|tsx|jsx|sh|bat|cmd|ps1|vbs|py|rb|php)$/i;

function inspectZip(fd: number, findings: ScanFinding[]): Promise<{ zip: yauzl.ZipFile; entries: Entry[] }> {
  return new Promise((resolve, reject) => {
    // Decode explicitly: yauzl's default filename validation would hide the offending name.
    yauzl.fromFd(fd, { lazyEntries: true, autoClose: false, decodeStrings: false, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) return reject(error ?? new Error('Invalid ZIP.'));
      const entries: Entry[] = []; const seen = new Map<string, string>(); let expanded = 0; let count = 0;
      let settled = false;
      const fail = (err: Error) => { if (!settled) { settled = true; reject(err); } };
      zip.on('error', fail);
      zip.on('entry', entry => {
        count++;
        if (count > M1_SCAN_LIMITS.entries) { findings.push(f('ENTRY_COUNT_EXCEEDED', 'critical', null, 'Entry count exceeds the limit.')); return fail(new Error('Entry count exceeded.')); }
        const raw = yauzl.getFileNameLowLevel(entry.generalPurposeBitFlag, entry.fileNameRaw, entry.extraFields, true);
        const directory = raw.endsWith('/');
        let valid = true;
        if (raw.includes('\\') || /[\x00-\x1f\x7f]/.test(raw)) { findings.push(f('PATH_ALIAS', 'critical', raw, 'Invalid archive path characters.')); valid = false; }
        if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) { findings.push(f('ABSOLUTE_PATH', 'critical', raw, 'Absolute archive path.')); valid = false; }
        const parts = raw.split('/');
        if (parts.includes('..')) { findings.push(f('PATH_TRAVERSAL', 'critical', raw, 'Path traversal entry.')); valid = false; }
        if (directory) parts.pop();
        if (!parts.length || parts.some(part => !part || part === '.' || /[. ]$/.test(part) || part.includes(':'))) { findings.push(f('PATH_ALIAS', 'critical', raw, 'Ambiguous archive path.')); valid = false; }
        const name = parts.join('/'); const key = name.normalize('NFC').toLowerCase();
        const previous = seen.get(key);
        if (previous !== undefined) { findings.push(f(previous === name ? 'DUPLICATE_PATH' : 'PATH_ALIAS', 'critical', raw, 'Duplicate or aliased archive entry.')); valid = false; }
        else seen.set(key, name);
        const mode = (entry.externalFileAttributes >>> 16) & 0xffff; const type = mode & 0xf000;
        if (type === 0xa000) findings.push(f('SYMLINK_ENTRY', 'critical', raw, 'Symlink archive entry.'));
        else if ((type !== 0 && type !== 0x4000 && type !== 0x8000) || (type === 0x4000 && !directory) || (type === 0x8000 && directory)) findings.push(f('SPECIAL_ENTRY', 'critical', raw, 'Special filesystem entry.'));
        if ((mode & 0o111) && !directory) findings.push(f('EXECUTABLE_FILE', 'critical', raw, 'Executable archive entry.'));
        if (!directory && executable.test(name)) findings.push(f('EXECUTABLE_FILE', 'critical', raw, 'Executable archive entry.'));
        if (!directory && script.test(name)) findings.push(f('SCRIPT_FILE', 'error', raw, 'Script archive entry.'));
        if (entry.uncompressedSize > M1_SCAN_LIMITS.singleEntryBytes) findings.push(f('SINGLE_ENTRY_TOO_LARGE', 'critical', raw, 'Entry exceeds single-file limit.'));
        expanded += entry.uncompressedSize;
        if (expanded > M1_SCAN_LIMITS.expandedBytes) findings.push(f('EXPANDED_TOO_LARGE', 'critical', raw, 'Expanded archive exceeds limit.'));
        if (entry.uncompressedSize > ZIP_RATIO_THRESHOLD_BYTES && (entry.compressedSize === 0 || entry.uncompressedSize / entry.compressedSize > ZIP_MAX_COMPRESSION_RATIO)) findings.push(f('ZIP_BOMB', 'critical', raw, 'Compression ratio exceeds safe limit.'));
        if (valid) entries.push({ name, zipEntry: entry, directory });
        zip.readEntry();
      });
      zip.on('end', () => { if (!settled) { settled = true; resolve({ zip, entries }); } });
      zip.readEntry();
    });
  });
}

async function extract(zip: yauzl.ZipFile, entry: Entry, path: string): Promise<void> {
  const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => zip.openReadStream(entry.zipEntry, (error, value) => error || !value ? reject(error ?? new Error('Cannot open entry.')) : resolve(value)));
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
  try { await pipeline(stream, createWriteStream(path, { fd: handle.fd, autoClose: false })); } finally { await handle.close(); }
}

function mimeMismatch(name: string, bytes: Buffer): boolean {
  const extension = name.toLowerCase().split('.').pop();
  if (extension === 'png') return !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === 'jpg' || extension === 'jpeg') return bytes.length < 3 || !bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (extension === 'gif') return !['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'));
  if (extension === 'pdf') return bytes.subarray(0, 5).toString('ascii') !== '%PDF-';
  return false;
}

async function scan(archivePath: string, filename: string, tempDir: string): Promise<Result> {
  const findings: ScanFinding[] = [];
  let archive: Awaited<ReturnType<typeof open>> | undefined;
  try {
    archive = await open(archivePath, 'r');
    const info = await archive.stat();
    if (!info.isFile()) throw new Error('Archive is not a file.');
    if (info.size > M1_SCAN_LIMITS.archiveBytes) return { findings: [f('ARCHIVE_TOO_LARGE', 'critical', filename, 'Archive exceeds limit.')], packageLicense: null };
    const { zip, entries } = await inspectZip(archive.fd, findings);
    try {
      const names = new Set(entries.map(entry => entry.name));
      if (filename.toLowerCase().endsWith('.motion') && !names.has('motion.json')) findings.push(f('MOTION_MANIFEST_MISSING', 'critical', 'motion.json', 'A .motion package requires root motion.json.'));
      if (findings.some(item => item.severity === 'critical' || item.severity === 'error')) return { findings, packageLicense: null };
      const sources: Array<{ file: string; text: string; scope?: string }> = [];
      const output = new yazl.ZipFile();
      let credentials = 0;
      for (const [index, entry] of entries.entries()) {
        if (entry.directory) continue;
        const path = join(tempDir, String(index));
        await extract(zip, entry, path);
        const handle = await open(path, 'r');
        const prefix = Buffer.alloc(8); let length: number;
        try { ({ bytesRead: length } = await handle.read(prefix, 0, prefix.length, 0)); } finally { await handle.close(); }
        const header = prefix.subarray(0, length);
        if (mimeMismatch(entry.name, header)) findings.push(f('MIME_MISMATCH', 'error', entry.name, 'File content does not match its extension.'));
        if (header.subarray(0, 2).toString('ascii') === 'MZ' || header.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) || header.subarray(0, 2).toString('ascii') === '#!') findings.push(f('MIME_MISMATCH', 'critical', entry.name, 'Executable content is not allowed.'));
        const isLicense = /^licenses\//i.test(entry.name) || /^TEMPLATE-LICENSE\.txt$/i.test(entry.name);
        const isReadme = /(^|\/)README(?:\.md|\.txt)?$/i.test(entry.name);
        const isAssetManifest = /(^|\/)(?:asset-manifest|assets-manifest)\.json$/i.test(entry.name);
        if (!isTextFile(entry.name)) { output.addFile(path, entry.name, { mode: 0o100644 }); continue; }
        if (entry.zipEntry.uncompressedSize > TEXT_SCAN_LIMIT_BYTES) {
          findings.push(f('TEXT_FILE_TOO_LARGE', 'warning', null, 'Text file exceeds the safe delivery scan limit.'));
          findings.push(f('SCRUB_INCOMPLETE', 'warning', null, 'Text file requires manual review.'));
          continue;
        }
        const bytes = await readFile(path);
        let text: string;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch {
          findings.push(f('SCRUB_INCOMPLETE', 'warning', null, 'Text encoding requires manual review.'));
          continue;
        }
        const scrubbed = scrubSecrets(entry.name, text);
        credentials += scrubbed.credentialCount;
        findings.push(...scrubbed.findings.map(item => ({ ...item, path: null })));
        if (scrubbed.manualReview) findings.push(f('SCRUB_INCOMPLETE', 'warning', null, 'Redacted text requires manual review.'));
        if (entry.name.toLowerCase().endsWith('.json')) {
          try { JSON.parse(scrubbed.text); } catch { findings.push(f('SCRUB_INCOMPLETE', 'warning', null, 'JSON requires manual review.')); }
        }
        await writeFile(path, Buffer.from(scrubbed.text, 'utf8'));
        output.addFile(path, entry.name, { mode: 0o100644 });
        if (!isLicense && !isReadme && !isAssetManifest) continue;
        if (isLicense) sources.push({ file: entry.name, text: scrubbed.text, scope: 'package' });
        if (isReadme) { const section = readmeLicenseSections(scrubbed.text); if (section) sources.push({ file: entry.name, text: section, scope: 'package' }); }
        if (isAssetManifest) { try { const parsed = JSON.parse(scrubbed.text) as { assets?: Array<{ license?: string }> }; for (const asset of parsed.assets ?? []) if (typeof asset.license === 'string' && asset.license.trim()) sources.push({ file: entry.name, text: asset.license, scope: 'asset' }); } catch { /* Non-license manifest content is ignored. */ } }
      }
      if (credentials > 5) findings.push(f('CREDENTIALS_TOO_MANY', 'critical', null, 'Too many credentials in archive.'));
      if (!sources.length) findings.push(f('LICENSE_FILE_MISSING', 'critical', null, 'No supported license source was found.'));
      const license = mergeLicenseTexts(sources);
      if (license.parserStatus === 'failed') findings.push(f('LICENSE_PARSE_CONFLICT', 'warning', license.file, 'License statements conflict.'));
      if (license.parserStatus === 'unknown' && license.file) findings.push(f('LICENSE_PARSER_UNKNOWN', 'warning', license.file, 'License requires manual review.'));
      output.end();
      await pipeline(output.outputStream, createWriteStream(join(tempDir, 'cleaned.zip'), { flags: 'wx', mode: 0o600 }));
      return { findings, packageLicense: license };
    } finally { /* The FileHandle owns the descriptor. */ }
  } catch {
    findings.push(f('ARCHIVE_INVALID', 'critical', null, 'Invalid archive.'));
    return { findings, packageLicense: null };
  } finally { if (archive) await archive.close(); }
}

if (parentPort) void scan(workerData.archivePath as string, workerData.filename as string, workerData.tempDir as string).then(result => parentPort!.postMessage(result));
