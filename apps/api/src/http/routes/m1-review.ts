import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import type { Database } from '../../db/types.js';
import { nowUtc, id } from '@shared/time.js';
import { captureProofUrl } from '../../proof/capture.js';
import { LocalPrivateStorage } from '../../storage/local-private-storage.js';
import { createSqliteReviewApprovalRepository } from '../../repositories/sqlite/m1-review-approval.js';
import { approveReview } from '../../application/templates/review-approval.js';
import { requestChanges } from '../../application/templates/request-changes.js';
import { createSqliteRequestChangesRepository } from '../../repositories/sqlite/m1-request-changes.js';
import { deriveBlockers, type ReviewSnapshot } from '../../application/templates/review-blockers.js';

type Db = Kysely<Database>;
const reasonSchema = z.string().trim().min(8);
const decisionSchema = z.object({ decision: z.enum(['passed', 'failed']), reason: reasonSchema });
const urlDecisionSchema = z.object({ urlAuthorityStatus: z.enum(['accepted', 'rejected']), reason: reasonSchema });
const assetDecisionSchema = z.object({ licenseStatus: z.enum(['passed', 'failed']), reason: reasonSchema });

async function requireAdmin(request: any, db: Db): Promise<string> {
  const userId = request.authContext?.userId as string | undefined;
  if (!userId) throw new DomainError(ERROR_CODES.AUTH_REQUIRED, 401, 'Authentication is required.');
  const row = await db.selectFrom('users').select('roles_json').where('id', '=', userId).executeTakeFirst();
  const roles = row ? JSON.parse(row.roles_json) as string[] : [];
  if (!roles.includes('admin')) throw new DomainError(ERROR_CODES.FORBIDDEN, 403, 'Administrator access is required.');
  return userId;
}

async function reviewSnapshot(db: Db, versionId: string): Promise<ReviewSnapshot | null> {
  const version = await db.selectFrom('template_versions').selectAll().where('version_id', '=', versionId).executeTakeFirst();
  if (!version) return null;
  const product = await db.selectFrom('template_products').selectAll().where('id', '=', version.template_id).executeTakeFirstOrThrow();
  const proof = await db.selectFrom('license_proofs').selectAll().where('version_id', '=', versionId).executeTakeFirst();
  const assets = await db.selectFrom('preview_assets').selectAll().where('version_id', '=', versionId).execute();
  const scan = version.scan_job_id ? await db.selectFrom('scan_jobs').selectAll().where('id', '=', version.scan_job_id).executeTakeFirst() : null;
  const packageLicense = JSON.parse(version.package_license_json) as { parserStatus?: 'parsed'|'failed'|'unknown'; semantic?: Record<string,string> };
  const capture = proof ? await db.selectFrom('proof_captures').selectAll().where('proof_id', '=', proof.id).where('version_id', '=', versionId).where('status', '=', 'active').orderBy('captured_at', 'desc').executeTakeFirst() : null;
  return {
    reviewTargetVersionId: product.review_target_version_id,
    versionId,
    versionRevision: version.revision,
    versionStatus: version.status as ReviewSnapshot['versionStatus'],
    immutable: version.immutable === 1,
    scanStatus: version.scan_status as ReviewSnapshot['scanStatus'],
    scanFindings: scan ? JSON.parse(scan.findings_json) : [],
    parserStatus: packageLicense.parserStatus ?? 'unknown',
    conflictFlag: version.conflict_flag === 1,
    proof: proof ? { id: proof.id, revision: proof.revision, hasFile: JSON.parse(proof.proof_files_json).length > 0, hasUrl: Boolean(proof.proof_link), fileReviewStatus: proof.file_review_status as any, verificationStatus: proof.verification_status as any, urlAuthorityStatus: proof.url_authority_status as any, captureOutcome: capture?.outcome as any ?? null } : null,
    previewAssets: assets.map(asset => ({ id: asset.id, revision: asset.revision, licenseStatus: asset.license_status as any })),
    hashMatches: true
  };
}

function auditValues(actorId: string, action: string, targetType: string, targetId: string, reason: string, before: unknown, after: unknown) {
  return { id: id('audit'), actor_type: 'user', actor_id: actorId, actor_email_snapshot: null, action, target_type: targetType, target_id: targetId, diff_json: JSON.stringify([{ field: 'status', before, after }]), reason, request_id: null, ip: null, user_agent: null, at: nowUtc() };
}

export function registerM1ReviewRoutes(app: FastifyInstance, db: Db, privateRoot: string): void {
  const storage = new LocalPrivateStorage(privateRoot);
  const approvalRepository = createSqliteReviewApprovalRepository(db);
  const requestChangesRepository = createSqliteRequestChangesRepository(db);
  app.get('/api/v1/admin/reviews', async request => {
    await requireAdmin(request, db);
    const products = await db.selectFrom('template_products').selectAll().where('review_target_version_id', 'is not', null).orderBy('updated_at', 'desc').execute();
    return { items: await Promise.all(products.map(async product => { const derived = deriveBlockers((await reviewSnapshot(db, product.review_target_version_id!))!); return { productId: product.id, versionId: product.review_target_version_id, blockers: derived.blockers, canApprove: derived.canApprove }; })) };
  });
  app.get('/api/v1/admin/reviews/:reviewId', async request => {
    await requireAdmin(request, db); const versionId = (request.params as { reviewId: string }).reviewId; const snapshot = await reviewSnapshot(db, versionId);
    if (!snapshot) throw new DomainError(ERROR_CODES.REVIEW_NOT_FOUND, 404, 'Review not found.');
    const result = deriveBlockers(snapshot); return { ...snapshot, blockers: result.blockers, canApprove: result.canApprove };
  });
  app.post('/api/v1/admin/reviews/:reviewId/proof/review', async request => {
    const actorId = await requireAdmin(request, db); const versionId = (request.params as { reviewId: string }).reviewId; const body = decisionSchema.parse(request.body);
    const proof = await db.selectFrom('license_proofs').selectAll().where('version_id', '=', versionId).executeTakeFirst(); if (!proof) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Proof not found.');
    await db.transaction().execute(async trx => { await trx.updateTable('license_proofs').set({ file_review_status: body.decision, verification_status: body.decision === 'passed' ? 'passed' : 'failed', reviewer_id: actorId, reviewed_at: nowUtc(), revision: proof.revision + 1, updated_at: nowUtc() }).where('id', '=', proof.id).execute(); await trx.insertInto('audit_logs').values(auditValues(actorId, 'proof.reviewed', 'license_proof', proof.id, body.reason, proof.file_review_status, body.decision)).execute(); });
    return { versionId, fileReviewStatus: body.decision };
  });
  app.post('/api/v1/admin/reviews/:reviewId/proof-url/review', async request => {
    const actorId = await requireAdmin(request, db); const versionId = (request.params as { reviewId: string }).reviewId; const body = urlDecisionSchema.parse(request.body);
    const proof = await db.selectFrom('license_proofs').selectAll().where('version_id', '=', versionId).executeTakeFirst(); if (!proof) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Proof not found.');
    await db.transaction().execute(async trx => { await trx.updateTable('license_proofs').set({ url_authority_status: body.urlAuthorityStatus, verification_status: body.urlAuthorityStatus === 'accepted' && proof.file_review_status !== 'failed' ? 'passed' : 'failed', reviewer_id: actorId, reviewed_at: nowUtc(), revision: proof.revision + 1, updated_at: nowUtc() }).where('id', '=', proof.id).execute(); await trx.insertInto('audit_logs').values(auditValues(actorId, 'proof.url_reviewed', 'license_proof', proof.id, body.reason, proof.url_authority_status, body.urlAuthorityStatus)).execute(); });
    return { versionId, urlAuthorityStatus: body.urlAuthorityStatus };
  });
  app.post('/api/v1/admin/reviews/:reviewId/assets/:assetId/review', async request => {
    const actorId = await requireAdmin(request, db); const assetId = (request.params as { assetId: string }).assetId; const body = assetDecisionSchema.parse(request.body);
    const asset = await db.selectFrom('preview_assets').selectAll().where('id', '=', assetId).executeTakeFirst(); if (!asset) throw new DomainError(ERROR_CODES.PREVIEW_ASSET_NOT_FOUND, 404, 'Preview asset not found.');
    await db.transaction().execute(async trx => { await trx.updateTable('preview_assets').set({ license_status: body.licenseStatus, reviewer_id: actorId, reviewed_at: nowUtc(), review_notes: body.reason, revision: asset.revision + 1 }).where('id', '=', assetId).execute(); await trx.insertInto('audit_logs').values(auditValues(actorId, 'preview_asset.reviewed', 'preview_asset', assetId, body.reason, asset.license_status, body.licenseStatus)).execute(); });
    return { assetId, licenseStatus: body.licenseStatus };
  });
  app.post('/api/v1/templates/:templateId/versions/:versionId/proof-link/capture', async request => {
    const userId = (request as any).authContext?.userId as string | undefined; if (!userId) throw new DomainError(ERROR_CODES.AUTH_REQUIRED, 401, 'Authentication is required.');
    const { templateId, versionId } = request.params as { templateId: string; versionId: string };
    const ownership = await db.selectFrom('template_versions').innerJoin('template_products', 'template_products.id', 'template_versions.template_id').select(['template_versions.template_id', 'template_versions.version_id', 'template_products.seller_id']).where('template_versions.version_id', '=', versionId).where('template_versions.template_id', '=', templateId).executeTakeFirst();
    if (!ownership || ownership.seller_id !== userId || ownership.version_id !== versionId || ownership.template_id !== templateId) throw new DomainError(ERROR_CODES.FORBIDDEN, 403, 'Only the owning seller can capture proof for this version.');
    const body = z.object({ proofLink: z.url() }).parse(request.body);
    const recent = await db.selectFrom('proof_captures').select(({ fn }) => fn.countAll<number>().as('count')).where('version_id', '=', versionId).where('captured_at', '>=', new Date(Date.now() - 60_000).toISOString()).executeTakeFirstOrThrow();
    if (Number(recent.count) >= 3) throw new DomainError(ERROR_CODES.PROOF_CAPTURE_RATE_LIMITED, 429, 'Proof capture is limited to three attempts per minute.');
    const proof = await db.selectFrom('license_proofs').selectAll().where('version_id', '=', versionId).where('template_id', '=', templateId).executeTakeFirst();
    if (!proof || proof.version_id !== versionId) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Proof not found.');
    if (!proof.proof_link || proof.proof_link !== body.proofLink) throw new DomainError(ERROR_CODES.PROOF_URL_NOT_AUTHORITATIVE, 409, 'Capture URL must match the proof declaration.');
    const result = await captureProofUrl(body.proofLink);
    if (result.proofLink !== body.proofLink) throw new DomainError(ERROR_CODES.PROOF_URL_NOT_AUTHORITATIVE, 409, 'Captured URL does not match the proof declaration.');
    await db.transaction().execute(async trx => {
      await trx.updateTable('proof_captures').set({ status: 'superseded' }).where('proof_id', '=', proof.id).where('version_id', '=', versionId).where('status', '=', 'active').execute();
      await trx.insertInto('proof_captures').values({ id: id('capture'), proof_id: proof.id, version_id: versionId, status: 'active', outcome: result.outcome, error_code: result.errorCode, proof_link: result.proofLink, final_url: result.finalUrl, source_domain: result.sourceDomain, title: result.title, h1: result.h1, page_summary: result.pageSummary, response_sha256: result.responseSha256, screenshot_sha256: null, captured_at: result.capturedAt, history_json: JSON.stringify(result.history) }).execute();
      await trx.updateTable('license_proofs').set({ captured_at: result.capturedAt, page_summary: result.pageSummary, screenshot_sha256: null, url_authority_status: 'pending', verification_status: 'manual_review', revision: proof.revision + 1, updated_at: result.capturedAt }).where('id', '=', proof.id).execute();
    });
    return { ...result, screenshotSha256: null };
  });
  app.post('/api/v1/admin/reviews/:reviewId/request-changes', async request => {
    const actorId = await requireAdmin(request, db);
    const reviewId = (request.params as { reviewId: string }).reviewId;
    const body = z.object({ expectedRevision: z.number().int().positive(), newVersionId: z.string().trim().min(1), newVersion: z.string().trim().min(1).max(64), reason: reasonSchema }).parse(request.body);
    return requestChanges(requestChangesRepository, { versionId: reviewId, actorId, ...body });
  });
  app.post('/api/v1/admin/reviews/:reviewId/reject', async request => {
    const actorId = await requireAdmin(request, db);
    const reviewId = (request.params as { reviewId: string }).reviewId;
    const body = z.object({ reason: reasonSchema }).parse(request.body);
    const version = await db.selectFrom('template_versions').selectAll().where('version_id', '=', reviewId).executeTakeFirst();
    if (!version) throw new DomainError(ERROR_CODES.REVIEW_NOT_FOUND, 404, 'Review not found.');
    const at = nowUtc();
    await db.transaction().execute(async trx => {
      const updated = await trx.updateTable('template_versions').set({ status: 'rejected', revision: version.revision + 1 }).where('version_id', '=', reviewId).where('status', '=', 'pending_license_review').where('revision', '=', version.revision).executeTakeFirst();
      if (Number(updated.numUpdatedRows) !== 1) throw new DomainError(ERROR_CODES.REVIEW_BLOCKERS_PRESENT, 409, 'Review changed while rejecting.');
      await trx.updateTable('template_products').set({ status: 'rejected', review_target_version_id: null, updated_at: at }).where('id', '=', version.template_id).where('review_target_version_id', '=', reviewId).execute();
      await trx.insertInto('audit_logs').values(auditValues(actorId, 'template.rejected', 'version', reviewId, body.reason, 'pending_license_review', 'rejected')).execute();
    });
    return { versionId: reviewId, status: 'rejected' };
  });
  app.post('/api/v1/admin/reviews/:reviewId/approve', async request => {
    const actorId = await requireAdmin(request, db);
    const versionId = (request.params as { reviewId: string }).reviewId;
    const reason = reasonSchema.parse((request.body as { reason?: string }).reason);
    return approveReview(approvalRepository, {
      versionId,
      actorId,
      reason,
      verifyHashes: async files => {
        for (const file of files) {
          const actual = await storage.stat(file.storageKey);
          if (!actual || actual.sha256 !== file.sha256) return false;
        }
        return files.length > 0;
      }
    });
  });
}
