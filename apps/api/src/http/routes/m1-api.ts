import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import { id, nowUtc } from '@shared/time.js';
import { createSqliteRepositories } from '../../repositories/sqlite/index.js';
import type { Database } from '../../db/types.js';
import type { Kysely } from 'kysely';
import { LocalPrivateStorage } from '../../storage/local-private-storage.js';
import { scanArchiveFile } from '../../scanning/scanner.js';
import { validateProofFile, normalizePreviewImage } from '../../storage/upload-validation.js';
import { assertPreviewUploadContentType } from '../../storage/upload-guards.js';

type Db = Kysely<Database>;
const productInput = z.object({
  name: z.object({ zh: z.string(), en: z.string() }),
  summary: z.object({ zh: z.string(), en: z.string() }),
  category: z.string().trim().min(1),
  licenseTypes: z.array(z.string()).min(1),
  priceUsdCents: z.number().int().nonnegative(),
  version: z.string().trim().min(1).max(64)
});
const versionInput = z.object({ version: z.string().trim().min(1).max(64) });
const proofDeclarationInput = z.object({
  declarationVersion: z.string().trim().min(1).max(64),
  declarationItems: z.array(z.object({ code: z.string().trim().min(1), accepted: z.boolean(), acceptedAt: z.string().nullable() })),
  signer: z.object({ name: z.string().trim().min(1), accountId: z.string().trim().min(1) }),
  signDate: z.iso.date(),
  proofLink: z.url().nullable().default(null)
});

function auth(request: any): string {
  const userId = request.authContext?.userId as string | undefined;
  if (!userId) throw new DomainError(ERROR_CODES.AUTH_REQUIRED, 401, 'Authentication is required.');
  return userId;
}

function validateDraft(product: { sellerId: string }, version: { templateId: string; status?: string; immutable: boolean }, sellerId: string, templateId: string): void {
  if (product.sellerId !== sellerId || version.templateId !== templateId) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Template or version not found.');
  if (version.immutable || version.status !== 'draft') throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Submitted versions are immutable.');
}

export function registerM1Routes(app: FastifyInstance, db: Db, privateRoot: string): void {
  app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1, parts: 8 } });
  const storage = new LocalPrivateStorage(privateRoot);
  const repos = createSqliteRepositories(db);
  const uploadSessions = new Map<string, { sellerId: string; templateId: string; versionId: string; storageKey: string; filename: string; contentType: string; sizeBytes: number; uploaded: boolean }>();

  app.post('/api/v1/templates', async request => {
    const sellerId = auth(request);
    const body = productInput.parse(request.body);
    const licenseTypes = body.licenseTypes as any[];
    const product = await repos.products.createDraft({ id: id('tpl'), sellerId, name: body.name, summary: body.summary, category: body.category, licenseTypes, licensePricing: licenseTypes.map((licenseType: any) => ({ licenseType, factor: '1', priceUsdCents: body.priceUsdCents })), priceUsdCents: body.priceUsdCents, version: body.version, now: nowUtc() });
    return { id: product.id, status: product.status, version: product.version };
  });

  app.post('/api/v1/templates/:templateId/versions', async request => {
    const sellerId = auth(request);
    const templateId = (request.params as { templateId: string }).templateId;
    const product = await repos.products.findById(templateId);
    if (!product || product.sellerId !== sellerId) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Template not found.');
    const body = versionInput.parse(request.body);
    const version = await repos.versions.createDraft({ versionId: id('ver'), templateId, version: body.version, files: [], packageLicense: { parserStatus: 'unknown', file: null, detected: null, excerpt: null }, licenseText: null, now: nowUtc() });
    return { versionId: version.versionId, status: 'draft' };
  });

  app.post('/api/v1/templates/:templateId/versions/:versionId/upload-session', async request => {
    const sellerId = auth(request);
    const { templateId, versionId } = request.params as { templateId: string; versionId: string };
    const product = await repos.products.findById(templateId);
    const version = await repos.versions.findById(versionId);
    if (!product || !version) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Template or version not found.');
    validateDraft(product, version, sellerId, templateId);
    const body = z.object({ filename: z.string().trim().min(1), contentType: z.string().trim().min(1), sizeBytes: z.number().int().positive().max(20 * 1024 * 1024) }).parse(request.body);
    const fileId = id('file');
    const filename = basename(body.filename);
    const storageKey = `quarantine/${templateId}/${versionId}/${fileId}.zip`;
    uploadSessions.set(fileId, { sellerId, templateId, versionId, storageKey, filename, contentType: body.contentType, sizeBytes: body.sizeBytes, uploaded: false });
    return { fileId, storageKey, maxBytes: 20 * 1024 * 1024, contentType: body.contentType };
  });

  app.post('/api/v1/templates/:templateId/versions/:versionId/files/:fileId/content', async request => {
    const sellerId = auth(request);
    const { templateId, versionId, fileId } = request.params as { templateId: string; versionId: string; fileId: string };
    const session = uploadSessions.get(fileId);
    if (!session || session.sellerId !== sellerId || session.templateId !== templateId || session.versionId !== versionId) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Upload session not found.');
    const product = await repos.products.findById(templateId);
    const version = await repos.versions.findById(versionId);
    if (!product || !version) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Template or version not found.');
    validateDraft(product, version, sellerId, templateId);
    const part = await request.file();
    if (!part) throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 422, 'Package file is required.');
    if (part.filename !== session.filename || part.mimetype !== session.contentType) throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 422, 'Upload metadata does not match the upload session.');
    const bytes = await part.toBuffer();
    if (bytes.byteLength !== session.sizeBytes || bytes.byteLength > 20 * 1024 * 1024) throw new DomainError(ERROR_CODES.SCAN_LIMIT_EXCEEDED, 422, 'Package size does not match the upload session.');
    const stored = await storage.put(session.storageKey, bytes);
    session.uploaded = true;
    return { fileId, storageKey: stored.storageKey, sha256: stored.sha256, sizeBytes: stored.sizeBytes };
  });

  app.post('/api/v1/templates/:templateId/versions/:versionId/files/:fileId/finalize', async request => {
    const sellerId = auth(request);
    const { templateId, versionId, fileId } = request.params as { templateId: string; versionId: string; fileId: string };
    const session = uploadSessions.get(fileId);
    if (!session || session.sellerId !== sellerId || session.templateId !== templateId || session.versionId !== versionId || !session.uploaded) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Upload session not found.');
    const product = await repos.products.findById(templateId);
    const version = await repos.versions.findById(versionId);
    if (!product || !version) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Template or version not found.');
    validateDraft(product, version, sellerId, templateId);
    const stored = await storage.stat(session.storageKey);
    if (!stored) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Uploaded package not found.');
    const scanId = id('scan');
    const createdAt = nowUtc();
    await db.transaction().execute(async trx => {
      await trx.insertInto('scan_jobs').values({ id: scanId, version_id: versionId, status: 'pending', findings_json: '[]', package_license_json: null, created_at: createdAt, updated_at: createdAt }).execute();
    });
    const cleanedKey = `templates/${templateId}/${versionId}/package-${fileId}-sanitized.zip`;
    const cleaned: { value?: { storageKey: string; sizeBytes: number; sha256: string } } = {};
    const result = await scanArchiveFile({ id: scanId, versionId, filename: session.filename, archivePath: join(privateRoot, session.storageKey), createdAt, onCleaned: async bytes => { cleaned.value = await storage.put(cleanedKey, bytes); } });
    const published = cleaned.value;
    if (result.status !== 'passed' || !published) {
      if (published) await storage.remove(published.storageKey);
      await db.updateTable('scan_jobs').set({ status: result.status, findings_json: JSON.stringify(result.findings), package_license_json: result.packageLicense ? JSON.stringify(result.packageLicense) : null, updated_at: nowUtc() }).where('id', '=', scanId).execute();
      return { fileId, scanJobId: scanId, scanStatus: result.status, scanFindings: result.findings, packageLicense: result.packageLicense };
    }
    try {
    await db.transaction().execute(async trx => {
      const updated = await trx.updateTable('template_versions').set({ scan_job_id: scanId, scan_status: result.status, package_license_json: JSON.stringify(result.packageLicense ?? { parserStatus: 'unknown', file: null, detected: null, excerpt: null }), conflict_flag: result.packageLicense?.parserStatus === 'failed' ? 1 : 0, revision: version.revision + 1 }).where('version_id', '=', versionId).where('revision', '=', version.revision).where('status', '=', 'draft').where('immutable', '=', 0).executeTakeFirst();
      if (Number(updated.numUpdatedRows) !== 1) throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Version changed while scanning.');
      await trx.updateTable('scan_jobs').set({ status: result.status, findings_json: JSON.stringify(result.findings), package_license_json: result.packageLicense ? JSON.stringify(result.packageLicense) : null, updated_at: nowUtc() }).where('id', '=', scanId).execute();
      await trx.insertInto('template_files').values({ file_id: fileId, version_id: versionId, kind: 'motion_package', storage_key: published.storageKey, filename: session.filename, mime_type: 'application/zip', size_bytes: published.sizeBytes, sha256: published.sha256, artifact_status: 'sanitized' }).execute();
    });
    } catch (error) { await storage.remove(published.storageKey); throw error; }
    return { fileId, scanJobId: scanId, scanStatus: result.status, scanFindings: result.findings, packageLicense: result.packageLicense };
  });

  app.get('/api/v1/scan-jobs/:scanJobId', async request => {
    auth(request);
    const scanJobId = (request.params as { scanJobId: string }).scanJobId;
    const row = await db.selectFrom('scan_jobs').selectAll().where('id', '=', scanJobId).executeTakeFirst();
    if (!row) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Scan job not found.');
    return { scanJobId: row.id, versionId: row.version_id, status: row.status, findings: JSON.parse(row.findings_json), packageLicense: row.package_license_json ? JSON.parse(row.package_license_json) : null };
  });

  app.post('/api/v1/templates/:templateId/versions/:versionId/license-proof', async request => {
    const sellerId = auth(request);
    const { templateId, versionId } = request.params as { templateId: string; versionId: string };
    const product = await repos.products.findById(templateId);
    const version = await repos.versions.findById(versionId);
    if (!product || !version) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Template or version not found.');
    validateDraft(product, version, sellerId, templateId);
    const body = proofDeclarationInput.parse(request.body);
    const proof = await repos.proofs.createDraft({ id: id('proof'), templateId, versionId, declarationVersion: body.declarationVersion, declarationItems: body.declarationItems, signer: body.signer, signDate: body.signDate, proofFiles: [], proofLink: body.proofLink, now: nowUtc() });
    return { id: proof.id, versionId, revision: proof.revision, verificationStatus: proof.verificationStatus };
  });

  app.post('/api/v1/templates/:templateId/versions/:versionId/license-proof/files', async request => {
    const sellerId = auth(request);
    const { templateId, versionId } = request.params as { templateId: string; versionId: string };
    const product = await repos.products.findById(templateId);
    const version = await repos.versions.findById(versionId);
    if (!product || !version) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Template or version not found.');
    validateDraft(product, version, sellerId, templateId);
    const existing = await repos.proofs.findByVersion(versionId);
    if (!existing) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'License proof declaration must be created before uploading evidence.');
    const part = await request.file();
    if (!part) throw new DomainError(ERROR_CODES.PROOF_FILE_INVALID, 422, 'Proof file is required.');
    const validated = validateProofFile(await part.toBuffer(), part.mimetype);
    const proofFileId = id('prooffile');
    const stored = await storage.put(`templates/${templateId}/${versionId}/proof-${proofFileId}.${validated.extension}`, validated.bytes);
    await repos.proofs.updateDraft(existing.id, { proofFiles: [...existing.proofFiles, { proofFileId, originalName: part.filename, storageKey: stored.storageKey, sha256: stored.sha256 }] });
    return { proofFileId, storageKey: stored.storageKey, sha256: stored.sha256 };
  });

  app.post('/api/v1/templates/:templateId/versions/:versionId/preview-assets', async request => {
    const sellerId = auth(request);
    const { templateId, versionId } = request.params as { templateId: string; versionId: string };
    const product = await repos.products.findById(templateId);
    const version = await repos.versions.findById(versionId);
    if (!product || !version) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Template or version not found.');
    validateDraft(product, version, sellerId, templateId);
    const part = await request.file();
    if (!part) throw new DomainError(ERROR_CODES.PREVIEW_ASSET_INVALID, 422, 'Preview image is required.');
    assertPreviewUploadContentType(part.mimetype);
    const validated = await normalizePreviewImage(await part.toBuffer(), part.mimetype);
    const assetId = id('asset');
    const stored = await storage.put(`templates/${templateId}/${versionId}/preview-${assetId}.webp`, validated.bytes);
    await db.insertInto('preview_assets').values({ id: assetId, template_id: templateId, version_id: versionId, kind: 'image', revision: 1, storage_key: stored.storageKey, url: null, sha256: stored.sha256, mime_type: validated.mimeType, size_bytes: stored.sizeBytes, license_name: 'seller declaration', license_source: 'seller', license_source_url: null, license_status: 'manual_review', proof_ref: null, reviewer_id: null, reviewed_at: null, review_notes: null, created_at: nowUtc() }).execute();
    return { assetId, licenseStatus: 'manual_review', sha256: stored.sha256 };
  });

  app.post('/api/v1/templates/:templateId/versions/:versionId/submit-review', async request => {
    const sellerId = auth(request);
    const { templateId, versionId } = request.params as { templateId: string; versionId: string };
    const product = await repos.products.findById(templateId);
    const version = await repos.versions.findById(versionId);
    if (!product || !version) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Template or version not found.');
    validateDraft(product, version, sellerId, templateId);
    if (version.scanStatus !== 'passed') throw new DomainError(ERROR_CODES.SCAN_MANUAL_REVIEW, 409, 'Scan is not ready for review.');
    const proof = await repos.proofs.findByVersion(versionId);
    if (!proof || (!proof.proofFiles.length && !proof.proofLink)) throw new DomainError(ERROR_CODES.PROOF_FILE_INVALID, 409, 'License proof is required before review.');
    const at = nowUtc();
    await db.transaction().execute(async trx => {
      await trx.updateTable('template_versions').set({ status: 'pending_license_review', immutable: 1, submitted_at: at, revision: version.revision + 1 }).where('version_id', '=', versionId).where('status', '=', 'draft').where('revision', '=', version.revision).execute();
      await trx.updateTable('template_products').set({ review_target_version_id: versionId, status: product.currentVersionId ? 'approved' : 'pending_license_review', updated_at: at }).where('id', '=', templateId).execute();
    });
    return { templateId, versionId, status: 'pending_license_review', reviewTargetVersionId: versionId };
  });
}
