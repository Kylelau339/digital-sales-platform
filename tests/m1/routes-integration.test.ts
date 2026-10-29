import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, createReadStream } from 'node:fs';
import yauzl from 'yauzl';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import yazl from 'yazl';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../../apps/api/src/db/types.js';
import { createDb } from '../../apps/api/src/db/client.js';
import { migrate } from '../../apps/api/src/db/cli.js';
import { createApp } from '../../apps/api/src/app.js';
import { loadEnv } from '../../apps/api/src/config/env.js';

const origin = 'http://localhost:5173';
const config = loadEnv({ NODE_ENV: 'test', ALLOWED_ORIGIN: origin });
let db: Kysely<Database>;
let app: FastifyInstance;
let folder: string;

function zipBuffer(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    zip.outputStream.pipe(stream);
    zip.addBuffer(Buffer.from(JSON.stringify({ name: 'demo', api_key: 'sk-original-secret', access_token: 'other-secret' })), 'motion.json');
    zip.addBuffer(Buffer.from('commercial use: allowed\nsource redistribution: allowed\nderivative resale: allowed'), 'TEMPLATE-LICENSE.txt');
    zip.end();
  });
}

function readZipEntry(path: string, name: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) { reject(error); return; }
      zip.on('error', reject);
      zip.on('entry', entry => {
        if (entry.fileName !== name) { zip.readEntry(); return; }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) { reject(streamError); return; }
          const chunks: Buffer[] = [];
          stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
          stream.on('error', reject);
          stream.on('end', () => resolve(Buffer.concat(chunks)));
        });
      });
      zip.on('end', () => reject(new Error('Entry not found')));
      zip.readEntry();
    });
  });
}


async function register(email: string, displayName: string) {
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin }, payload: { email, password: 'Test-Password-123', displayName } });
  expect(response.statusCode).toBe(201);
  const cookie = response.cookies.find(item => item.name === 'motion_session');
  return { cookie: `motion_session=${encodeURIComponent(cookie!.value)}`, csrf: response.json().csrfToken, userId: response.json().user.id };
}

function headers(session: { cookie: string; csrf: string }) { return { origin, cookie: session.cookie, 'x-csrf-token': session.csrf }; }

function multipart(field: string, value: Buffer, filename: string, contentType: string) {
  const boundary = `----motion-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const prefix = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`);
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([prefix, value, suffix]), contentType: `multipart/form-data; boundary=${boundary}` };
}

beforeEach(async () => { folder = mkdtempSync(join(tmpdir(), 'motion-http-')); db = createDb(':memory:'); await migrate(db); app = createApp(db, loadEnv({ NODE_ENV: 'test', ALLOWED_ORIGIN: origin, PRIVATE_STORAGE_PATH: folder })); await app.ready(); });
afterEach(async () => { await app.close(); await db.destroy(); rmSync(folder, { recursive: true, force: true }); });

describe('registered M1 Fastify integration', () => {
  it('uploads, scans, reviews, approves, persists and exposes a listing', async () => {
    const seller = await register('seller@example.com', 'Seller');
    const admin = await register('admin@example.com', 'Admin');
    const repos = await import('../../apps/api/src/repositories/sqlite/index.js');
    await repos.createSqliteRepositories(db).users.addRole(admin.userId, 'admin');
    const productResponse = await app.inject({ method: 'POST', url: '/api/v1/templates', headers: headers(seller), payload: { name: { zh: 'Demo', en: 'Demo' }, summary: { zh: 'Summary', en: 'Summary' }, category: 'intro', licenseTypes: ['commercial_single_project'], priceUsdCents: 1000, version: '1.0.0' } });
    expect(productResponse.statusCode).toBe(200);
    const templateId = productResponse.json().id as string;
    const versionResponse = await app.inject({ method: 'POST', url: `/api/v1/templates/${templateId}/versions`, headers: headers(seller), payload: { version: '1.0.0' } });
    expect(versionResponse.statusCode).toBe(200);
    const versionId = versionResponse.json().versionId as string;
    const archive = await zipBuffer();
    const sessionResponse = await app.inject({ method: 'POST', url: `/api/v1/templates/${templateId}/versions/${versionId}/upload-session`, headers: headers(seller), payload: { filename: 'demo.zip', contentType: 'application/zip', sizeBytes: archive.length } });
    expect(sessionResponse.statusCode).toBe(200);
    const fileId = sessionResponse.json().fileId as string;
    const contentMultipart = multipart('file', archive, 'demo.zip', 'application/zip');
    const contentResponse = await app.inject({ method: 'POST', url: `/api/v1/templates/${templateId}/versions/${versionId}/files/${fileId}/content`, headers: { ...headers(seller), 'content-type': contentMultipart.contentType }, payload: contentMultipart.body });
    expect(contentResponse.statusCode).toBe(200);
    const finalizeResponse = await app.inject({ method: 'POST', url: `/api/v1/templates/${templateId}/versions/${versionId}/files/${fileId}/finalize`, headers: headers(seller), payload: {} });
    expect(finalizeResponse.statusCode).toBe(200);
    expect(finalizeResponse.json().scanStatus).toBe('passed');
    const storedFile = await db.selectFrom('template_files').selectAll().where('file_id', '=', fileId).executeTakeFirstOrThrow();
    expect(storedFile.storage_key).not.toBe(contentResponse.json().storageKey);
    expect(storedFile.sha256).not.toBe(contentResponse.json().sha256);
    const sanitized = JSON.parse((await readZipEntry(join(folder, storedFile.storage_key), 'motion.json')).toString('utf8'));
    expect(sanitized.api_key).toBe('[REDACTED_BY_PLATFORM]');
    expect(sanitized.access_token).toBe('[REDACTED_BY_PLATFORM]');
    expect(finalizeResponse.body).not.toContain('sk-original-secret');
    expect(JSON.stringify(await db.selectFrom('scan_jobs').selectAll().execute())).not.toContain('sk-original-secret');
    expect(JSON.stringify(await db.selectFrom('template_files').selectAll().execute())).not.toContain('sk-original-secret');
    const proofResponse = await app.inject({ method: 'POST', url: `/api/v1/templates/${templateId}/versions/${versionId}/license-proof`, headers: headers(seller), payload: { declarationVersion: '1', declarationItems: [{ code: 'resale', accepted: true, acceptedAt: null }], signer: { name: 'Seller', accountId: seller.userId }, signDate: '2026-10-28', proofLink: null } });
    expect(proofResponse.statusCode).toBe(200);
    const foreignCapture = await app.inject({ method: 'POST', url: `/api/v1/templates/${templateId}/versions/${versionId}/proof-link/capture`, headers: headers(admin), payload: { proofLink: 'https://example.com/proof' } });
    expect(foreignCapture.statusCode).toBe(403);
    const undeclaredCapture = await app.inject({ method: 'POST', url: `/api/v1/templates/${templateId}/versions/${versionId}/proof-link/capture`, headers: headers(seller), payload: { proofLink: 'https://example.com/proof' } });
    expect(undeclaredCapture.statusCode).toBe(409);
    const proofPdf = Buffer.from('%PDF-1.7 proof');
    const proofMultipart = multipart('file', proofPdf, 'proof.pdf', 'application/pdf');
    const proofUpload = await app.inject({ method: 'POST', url: `/api/v1/templates/${templateId}/versions/${versionId}/license-proof/files`, headers: { ...headers(seller), 'content-type': proofMultipart.contentType }, payload: proofMultipart.body });
    expect(proofUpload.statusCode).toBe(200);
    const preview = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const previewMultipart = multipart('file', preview, 'preview.png', 'image/png');
    const previewResponse = await app.inject({ method: 'POST', url: `/api/v1/templates/${templateId}/versions/${versionId}/preview-assets`, headers: { ...headers(seller), 'content-type': previewMultipart.contentType }, payload: previewMultipart.body });
    expect(previewResponse.statusCode).toBe(200);
    const submit = await app.inject({ method: 'POST', url: `/api/v1/templates/${templateId}/versions/${versionId}/submit-review`, headers: headers(seller), payload: {} });
    expect(submit.statusCode).toBe(200);
    const queue = await app.inject({ method: 'GET', url: '/api/v1/admin/reviews', headers: { cookie: admin.cookie } });
    expect(queue.statusCode).toBe(200);
    const review = await app.inject({ method: 'GET', url: `/api/v1/admin/reviews/${versionId}`, headers: { cookie: admin.cookie } });
    expect(review.statusCode).toBe(200);
    const proofId = (await db.selectFrom('license_proofs').select('id').where('version_id', '=', versionId).executeTakeFirstOrThrow()).id;
    const assetId = (await db.selectFrom('preview_assets').select('id').where('version_id', '=', versionId).executeTakeFirstOrThrow()).id;
    expect((await app.inject({ method: 'POST', url: `/api/v1/admin/reviews/${versionId}/proof/review`, headers: headers(admin), payload: { decision: 'passed', reason: 'Evidence is valid' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/v1/admin/reviews/${versionId}/assets/${assetId}/review`, headers: headers(admin), payload: { licenseStatus: 'passed', reason: 'Preview is authorized' } })).statusCode).toBe(200);
    const approve = await app.inject({ method: 'POST', url: `/api/v1/admin/reviews/${versionId}/approve`, headers: headers(admin), payload: { reason: 'All evidence is valid' } });
    expect(approve.statusCode).toBe(200);
    const product = await db.selectFrom('template_products').select(['status', 'current_version_id', 'review_target_version_id']).where('id', '=', templateId).executeTakeFirstOrThrow();
    expect(product).toEqual({ status: 'approved', current_version_id: versionId, review_target_version_id: null });
    const catalog = await app.inject({ method: 'GET', url: '/api/v1/templates' });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().items[0].id).toBe(templateId);
    expect(catalog.json().items[0].currentVersionId).toBe(versionId);
    expect(proofId).toBeTruthy();
  });
});
