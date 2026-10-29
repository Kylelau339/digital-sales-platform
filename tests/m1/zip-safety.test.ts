import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWriteStream } from 'node:fs';
import { mkdtemp, mkdir, readdir, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';
import { scanArchiveFile } from '../../apps/api/src/scanning/scanner.js';

let root: string;
let tempRoot: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'zip-test-')); tempRoot = join(root, 'temp'); await mkdir(tempRoot); });
afterEach(async () => { vi.useRealTimers(); await rm(root, { recursive: true, force: true }); });

async function makeZip(entries: Array<[string, string]>): Promise<string> {
  const path = join(root, 'input.zip');
  const zip = new yazl.ZipFile();
  for (const [name, value] of entries) zip.addBuffer(Buffer.from(value), name);
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(path));
  return path;
}
async function run(archivePath: string, filename = 'input.zip') {
  const result = await scanArchiveFile({ archivePath, filename, id: 'id', versionId: 'version', createdAt: 'now', tempRoot });
  expect(await readdir(tempRoot)).toEqual([]);
  expect((await readdir(root)).sort()).toEqual(['input.zip', 'temp']);
  return result;
}

describe('zip safety', () => {
  it('rejects traversal before extraction', async () => {
    const path = await makeZip([['xx/escape.txt', 'bad'], ['TEMPLATE-LICENSE.txt', 'unknown']]);
    const bytes = await readFile(path);
    const original = Buffer.from('xx/escape.txt'); const replacement = Buffer.from('../escape.txt');
    let index = bytes.indexOf(original);
    while (index !== -1) { replacement.copy(bytes, index); index = bytes.indexOf(original, index + replacement.length); }
    await writeFile(path, bytes);
    const result = await run(path);
    expect(result.status).toBe('failed');
    expect(result.findings.map(item => item.code)).toContain('PATH_TRAVERSAL');
  });
  it('rejects scripts and aliased paths', async () => {
    const result = await run(await makeZip([['run.js', 'x'], ['File.txt', 'a'], ['file.txt', 'b']]));
    expect(result.findings.map(item => item.code)).toEqual(expect.arrayContaining(['SCRIPT_FILE', 'PATH_ALIAS']));
  });
  it('rejects empty archives for missing license', async () => {
    const result = await run(await makeZip([]));
    expect(result.status).toBe('failed');
    expect(result.findings.map(item => item.code)).toContain('LICENSE_FILE_MISSING');
  });
  it('passes a license-only archive even when the parser is uncertain', async () => {
    const result = await run(await makeZip([['TEMPLATE-LICENSE.txt', 'A license requiring review.']]));
    expect(result.status).toBe('passed');
    expect(result.packageLicense?.parserStatus).toBe('unknown');
  });
  it('keeps license conflicts separate from structural status', async () => {
    const result = await run(await makeZip([['TEMPLATE-LICENSE.txt', 'Commercial use is allowed.\nCommercial use is prohibited.']]));
    expect(result.status).toBe('passed');
    expect(result.packageLicense?.parserStatus).toBe('failed');
    expect(result.findings.map(item => item.code)).toContain('LICENSE_PARSE_CONFLICT');
  });
  it('reports content mismatches', async () => {
    const result = await run(await makeZip([['image.png', 'not a png'], ['TEMPLATE-LICENSE.txt', 'review']]));
    expect(result.status).toBe('failed');
    expect(result.findings.map(item => item.code)).toContain('MIME_MISMATCH');
  });
  it('scrubs credentials from motion.json and blocks high-risk keys', async () => {
    const result = await run(await makeZip([['motion.json', JSON.stringify({ api_key: 'sk-' + 'a'.repeat(40) })], ['TEMPLATE-LICENSE.txt', 'review']]));
    expect(result.findings.map(item => item.code)).toContain('CREDENTIALS_DETECTED');
    const highRisk = await run(await makeZip([['motion.json', 'AWS=AKIA1234567890ABCDEF'], ['TEMPLATE-LICENSE.txt', 'review']]));
    expect(highRisk.status).toBe('failed');
    expect(highRisk.findings.map(item => item.code)).toContain('HIGH_RISK_CREDENTIALS');
  });
});
