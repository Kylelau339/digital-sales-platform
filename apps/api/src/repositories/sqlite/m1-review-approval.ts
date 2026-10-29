import type { Kysely, Transaction } from 'kysely';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import { id, nowUtc } from '@shared/time.js';
import type { Database } from '../../db/types.js';
import type { ApprovalRepository, ApprovalSnapshot, ApprovalTransaction } from '../../application/templates/review-approval.js';
import type { ReviewSnapshot } from '../../application/templates/review-blockers.js';

type Db = Kysely<Database> | Transaction<Database>;

async function load(db: Db, versionId: string): Promise<ApprovalSnapshot | null> {
  const version = await db.selectFrom('template_versions').selectAll().where('version_id', '=', versionId).executeTakeFirst();
  if (!version) return null;
  const product = await db.selectFrom('template_products').selectAll().where('id', '=', version.template_id).executeTakeFirst();
  if (!product) return null;
  const proof = await db.selectFrom('license_proofs').selectAll().where('version_id', '=', versionId).executeTakeFirst();
  const assets = await db.selectFrom('preview_assets').selectAll().where('version_id', '=', versionId).orderBy('id').execute();
  const files = await db.selectFrom('template_files').selectAll().where('version_id', '=', versionId).orderBy('file_id').execute();
  const scan = version.scan_job_id ? await db.selectFrom('scan_jobs').selectAll().where('id', '=', version.scan_job_id).executeTakeFirst() : undefined;
  const capture = proof ? await db.selectFrom('proof_captures').selectAll().where('proof_id', '=', proof.id).where('version_id', '=', versionId).where('status', '=', 'active').orderBy('captured_at', 'desc').orderBy('id', 'desc').executeTakeFirst() : undefined;
  const license = JSON.parse(version.package_license_json) as { parserStatus?: ReviewSnapshot['parserStatus'] };
  const proofFiles: unknown = proof ? JSON.parse(proof.proof_files_json) : [];
  const review: ReviewSnapshot = {
    reviewTargetVersionId: product.review_target_version_id, versionId, versionRevision: version.revision,
    versionStatus: version.status as ReviewSnapshot['versionStatus'], immutable: version.immutable === 1,
    scanStatus: version.scan_status as ReviewSnapshot['scanStatus'],
    scanFindings: scan ? JSON.parse(scan.findings_json) : [{ severity: 'error', code: 'SCAN_MISSING' }],
    parserStatus: license.parserStatus ?? 'unknown', conflictFlag: version.conflict_flag !== 0 || (proof?.conflict_flag ?? 0) !== 0,
    proof: proof ? {
      id: proof.id, revision: proof.revision, hasFile: Array.isArray(proofFiles) && proofFiles.length > 0,
      hasUrl: Boolean(proof.proof_link?.trim()), fileReviewStatus: proof.file_review_status as NonNullable<ReviewSnapshot['proof']>['fileReviewStatus'],
      verificationStatus: proof.verification_status as NonNullable<ReviewSnapshot['proof']>['verificationStatus'],
      urlAuthorityStatus: proof.url_authority_status as NonNullable<ReviewSnapshot['proof']>['urlAuthorityStatus'],
      captureOutcome: capture && capture.proof_link === proof.proof_link ? capture.outcome as NonNullable<ReviewSnapshot['proof']>['captureOutcome'] : null
    } : null,
    previewAssets: assets.map(asset => ({ id: asset.id, revision: asset.revision, licenseStatus: asset.license_status as ReviewSnapshot['previewAssets'][number]['licenseStatus'] })),
    hashMatches: false
  };
  return { review, files: files.map(file => ({ fileId: file.file_id, storageKey: file.storage_key, sha256: file.sha256 })) };
}

export function createSqliteReviewApprovalRepository(db: Kysely<Database>): ApprovalRepository {
  return {
    load: versionId => load(db, versionId),
    transaction: work => db.transaction().execute(async trx => {
      const transaction: ApprovalTransaction = {
        load: versionId => load(trx, versionId),
        async approve(snapshot, actorId, reason) {
          const now = nowUtc();
          const versionId = snapshot.review.versionId;
          const updated = await trx.updateTable('template_versions').set({ status: 'approved', immutable: 1, approved_at: now, revision: snapshot.review.versionRevision + 1 }).where('version_id', '=', versionId).where('status', '=', 'pending_license_review').where('revision', '=', snapshot.review.versionRevision).executeTakeFirst();
          if (Number(updated.numUpdatedRows) !== 1) throw new DomainError(ERROR_CODES.REVIEW_BLOCKERS_PRESENT, 409, 'Review changed while approval was in progress.');
          const product = await trx.updateTable('template_products').set({ status: 'approved', current_version_id: versionId, review_target_version_id: null, updated_at: now }).where('review_target_version_id', '=', versionId).where('id', '=', (await trx.selectFrom('template_versions').select('template_id').where('version_id', '=', versionId).executeTakeFirstOrThrow()).template_id).executeTakeFirst();
          if (Number(product.numUpdatedRows) !== 1) throw new DomainError(ERROR_CODES.REVIEW_BLOCKERS_PRESENT, 409, 'Review changed while approval was in progress.');
          await trx.insertInto('audit_logs').values({ id: id('audit'), actor_type: 'user', actor_id: actorId, actor_email_snapshot: null, action: 'template.approved', target_type: 'version', target_id: versionId, diff_json: JSON.stringify([{ field: 'status', before: 'pending_license_review', after: 'approved' }]), reason, request_id: null, ip: null, user_agent: null, at: now }).execute();
        }
      };
      return work(transaction);
    })
  };
}
