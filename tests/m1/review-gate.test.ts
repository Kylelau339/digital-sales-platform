import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql, type Kysely } from 'kysely';
import { createDb } from '../../apps/api/src/db/client.js';
import { migrate } from '../../apps/api/src/db/cli.js';
import type { Database } from '../../apps/api/src/db/types.js';
import { createSqliteRepositories } from '../../apps/api/src/repositories/sqlite/index.js';
import { createSqliteReviewApprovalRepository } from '../../apps/api/src/repositories/sqlite/m1-review-approval.js';
import { approveReview } from '../../apps/api/src/application/templates/review-approval.js';
import { deriveBlockers, type ReviewSnapshot } from '../../apps/api/src/application/templates/review-blockers.js';

const valid = (): ReviewSnapshot => ({ reviewTargetVersionId: 'ver', versionId: 'ver', versionRevision: 1, versionStatus: 'pending_license_review', immutable: true, scanStatus: 'passed', scanFindings: [], parserStatus: 'parsed', conflictFlag: false, proof: { id: 'proof', revision: 1, hasFile: true, hasUrl: false, fileReviewStatus: 'passed', verificationStatus: 'passed', urlAuthorityStatus: 'pending', captureOutcome: null }, previewAssets: [{ id: 'asset', revision: 1, licenseStatus: 'passed' }], hashMatches: true });

describe('review blockers', () => {
  it('accepts file-only and URL-only evidence', () => {
    expect(deriveBlockers(valid())).toEqual({ blockers: [], canApprove: true });
    const review = valid(); Object.assign(review.proof!, { hasFile: false, hasUrl: true, fileReviewStatus: 'pending', urlAuthorityStatus: 'accepted', captureOutcome: 'passed' });
    expect(deriveBlockers(review).canApprove).toBe(true);
  });
  it('requires both proof channels and reports failed and pending previews together', () => {
    const review = valid(); Object.assign(review.proof!, { hasUrl: true, captureOutcome: 'failed', urlAuthorityStatus: 'accepted' });
    review.previewAssets.push({ id: 'bad', revision: 1, licenseStatus: 'failed' }, { id: 'pending', revision: 1, licenseStatus: 'manual_review' });
    expect(deriveBlockers(review).blockers).toEqual(expect.arrayContaining(['PROOF_URL_CAPTURE_FAILED', 'PREVIEW_LICENSE_FAILED', 'PREVIEW_LICENSE_REVIEW_PENDING']));
  });
  it('blocks manual scans, unknown parser, incomplete proof, incorrect target and changed hash', () => {
    const review = valid(); review.scanStatus = 'manual_review'; review.parserStatus = 'unknown'; review.reviewTargetVersionId = null; review.hashMatches = false; review.proof!.verificationStatus = 'manual_review';
    expect(deriveBlockers(review).blockers).toEqual(expect.arrayContaining(['SCAN_NOT_FINISHED', 'LICENSE_UNKNOWN', 'VERSION_NOT_CURRENT_REVIEW_TARGET', 'VERSION_HASH_CHANGED', 'PROOF_REVIEW_PENDING']));
  });
  it('blocks non-pending versions and failed parser independently of conflict', () => {
    const review = valid(); review.versionStatus = 'approved'; review.parserStatus = 'failed';
    expect(deriveBlockers(review).blockers).toEqual(expect.arrayContaining(['VERSION_NOT_CURRENT_REVIEW_TARGET', 'LICENSE_PARSER_FAILED']));
  });
});

const now = '2026-10-01T00:00:00.000Z';
let folder: string;
let db: Kysely<Database>;
beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'motion-review-')); db = createDb(join(folder, 'db.sqlite')); await migrate(db);
  const repos = createSqliteRepositories(db);
  await repos.users.create({ id: 'seller', email: 'seller@example.com', passwordHash: 'unused', displayName: 'Seller', roles: ['seller'], now });
  await repos.products.createDraft({ id: 'tpl', sellerId: 'seller', name: { zh: 'x', en: 'x' }, summary: { zh: 'x', en: 'x' }, category: 'intro', licenseTypes: ['commercial_single_project'], licensePricing: [{ licenseType: 'commercial_single_project', factor: '1', priceUsdCents: 1000 }], priceUsdCents: 1000, version: '1.0.0', now });
  await repos.versions.createDraft({ versionId: 'ver', templateId: 'tpl', version: '1.0.0', files: [], packageLicense: { parserStatus: 'parsed', file: null, detected: null, excerpt: null }, licenseText: null, now });
  await db.insertInto('scan_jobs').values({ id: 'scan', version_id: 'ver', status: 'passed', findings_json: '[]', package_license_json: null, created_at: now, updated_at: now }).execute();
  await db.updateTable('template_versions').set({ status: 'pending_license_review', immutable: 1, scan_status: 'passed', scan_job_id: 'scan' }).where('version_id', '=', 'ver').execute();
  await db.updateTable('template_products').set({ status: 'pending_license_review', review_target_version_id: 'ver' }).where('id', '=', 'tpl').execute();
  await db.insertInto('template_files').values({ file_id: 'file', version_id: 'ver', kind: 'motion_package', storage_key: 'package.zip', filename: 'package.zip', mime_type: 'application/zip', size_bytes: 1, sha256: 'a'.repeat(64) }).execute();
  await db.insertInto('license_proofs').values({ id: 'proof', template_id: 'tpl', version_id: 'ver', declaration_version: '1', declaration_items_json: '[]', signer_json: '{}', sign_date: now, proof_files_json: '[{"id":"file"}]', proof_link: null, revision: 1, file_review_status: 'passed', url_authority_status: 'pending', captured_at: null, page_summary: null, screenshot_sha256: null, reviewer_id: null, reviewed_at: null, conflict_flag: 0, verification_status: 'passed', created_at: now, updated_at: now }).execute();
  await db.insertInto('preview_assets').values({ id: 'asset', template_id: 'tpl', version_id: 'ver', kind: 'image', revision: 1, storage_key: 'preview.png', url: null, sha256: 'b'.repeat(64), mime_type: 'image/png', size_bytes: 1, license_name: 'owned', license_source: 'owner', license_source_url: null, license_status: 'passed', proof_ref: null, reviewer_id: null, reviewed_at: null, review_notes: null, created_at: now }).execute();
});
afterEach(async () => { await db.destroy(); rmSync(folder, { recursive: true, force: true }); });
const request = (verifyHashes: () => Promise<boolean>) => ({ versionId: 'ver', actorId: 'seller', reason: 'Approved after review', verifyHashes });

describe('SQLite approval', () => {
  it('allows only one of two concurrent approvals and appends one audit', async () => {
    const repo = createSqliteReviewApprovalRepository(db);
    let count = 0; let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; });
    const verify = async () => { if (++count === 2) release(); await barrier; return true; };
    const results = await Promise.allSettled([approveReview(repo, request(verify)), approveReview(repo, request(verify))]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect((await db.selectFrom('audit_logs').selectAll().where('action', '=', 'template.approved').execute())).toHaveLength(1);
    expect(await db.selectFrom('template_products').select(['current_version_id', 'review_target_version_id']).where('id', '=', 'tpl').executeTakeFirst()).toEqual({ current_version_id: 'ver', review_target_version_id: null });
    expect(await db.selectFrom('template_versions').select(['revision', 'status']).where('version_id', '=', 'ver').executeTakeFirst()).toEqual({ revision: 2, status: 'approved' });
  });
  it('rejects a proof revision changed after the snapshot without writes', async () => {
    const repo = createSqliteReviewApprovalRepository(db);
    await expect(approveReview(repo, request(async () => { await db.updateTable('license_proofs').set({ revision: 2 }).where('id', '=', 'proof').execute(); return true; }))).rejects.toMatchObject({ code: 'REVIEW_BLOCKERS_PRESENT' });
    expect((await db.selectFrom('template_versions').selectAll().where('version_id', '=', 'ver').executeTakeFirstOrThrow()).status).toBe('pending_license_review');
    expect(await db.selectFrom('audit_logs').selectAll().where('action', '=', 'template.approved').execute()).toHaveLength(0);
  });
  it('rejects replacement of a preview asset with the same revision', async () => {
    const repo = createSqliteReviewApprovalRepository(db);
    await expect(approveReview(repo, request(async () => {
      const asset = await db.selectFrom('preview_assets').selectAll().where('id', '=', 'asset').executeTakeFirstOrThrow();
      await db.deleteFrom('preview_assets').where('id', '=', 'asset').execute();
      await db.insertInto('preview_assets').values({ ...asset, id: 'replacement' }).execute();
      return true;
    }))).rejects.toMatchObject({ code: 'REVIEW_BLOCKERS_PRESENT' });
    expect((await db.selectFrom('template_versions').selectAll().where('version_id', '=', 'ver').executeTakeFirstOrThrow()).status).toBe('pending_license_review');
  });
  it('rolls back the state transition when the audit insert fails', async () => {
    await sql`CREATE TRIGGER reject_approval_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit failure'); END`.execute(db);
    await expect(approveReview(createSqliteReviewApprovalRepository(db), request(async () => true))).rejects.toBeDefined();
    expect((await db.selectFrom('template_versions').selectAll().where('version_id', '=', 'ver').executeTakeFirstOrThrow()).status).toBe('pending_license_review');
    expect((await db.selectFrom('template_products').selectAll().where('id', '=', 'tpl').executeTakeFirstOrThrow()).review_target_version_id).toBe('ver');
  });
  it('blocks a changed hash before transaction', async () => {
    await expect(approveReview(createSqliteReviewApprovalRepository(db), request(async () => false))).rejects.toMatchObject({ code: 'REVIEW_BLOCKERS_PRESENT', details: { blockers: expect.arrayContaining(['VERSION_HASH_CHANGED']) } });
  });
});
