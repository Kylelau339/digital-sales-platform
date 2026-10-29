import type { Kysely } from 'kysely';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import { id, nowUtc } from '@shared/time.js';
import type { Database } from '../../db/types.js';
import type { RequestChangesRepository } from '../../application/templates/request-changes.js';
import { requestChangesState } from '../../application/templates/request-changes-state.js';
import { mapProduct, mapVersion } from './mapping.js';

const changed = () => new DomainError(ERROR_CODES.CONFLICT, 409, 'Review changed while requesting changes.');

export function createSqliteRequestChangesRepository(db: Kysely<Database>): RequestChangesRepository {
  return {
    async requestChanges(input) {
      try {
        return await db.transaction().execute(async trx => {
          const version = await trx.selectFrom('template_versions').selectAll().where('version_id', '=', input.versionId).executeTakeFirst();
          if (!version) throw new DomainError(ERROR_CODES.REVIEW_NOT_FOUND, 404, 'Review not found.');
          const product = await trx.selectFrom('template_products').selectAll().where('id', '=', version.template_id).executeTakeFirst();
          if (!product) throw new DomainError(ERROR_CODES.REVIEW_NOT_FOUND, 404, 'Review not found.');
          if (product.review_target_version_id !== version.version_id || version.revision !== input.expectedRevision || version.status !== 'pending_license_review' || (product.current_version_id ? product.status !== 'approved' : product.status !== 'pending_license_review')) throw changed();
          if (product.current_version_id) {
            const current = await trx.selectFrom('template_versions').select(['status', 'template_id']).where('version_id', '=', product.current_version_id).executeTakeFirst();
            if (!current || current.template_id !== product.id || current.status !== 'approved' || product.status !== 'approved') throw changed();
          }
          const result = requestChangesState(mapProduct(product), mapVersion(version, []), input.newVersionId);
          const now = nowUtc();
          const updated = await trx.updateTable('template_versions').set({ status: result.oldVersionStatus, revision: version.revision + 1 }).where('version_id', '=', version.version_id).where('status', '=', 'pending_license_review').where('revision', '=', input.expectedRevision).executeTakeFirst();
          if (Number(updated.numUpdatedRows) !== 1) throw changed();
          if (!product.current_version_id) {
            const rejected = await trx.updateTable('template_products').set({ status: 'rejected' }).where('id', '=', product.id).where('status', '=', 'pending_license_review').where('review_target_version_id', '=', version.version_id).where('current_version_id', 'is', null).executeTakeFirst();
            if (Number(rejected.numUpdatedRows) !== 1) throw changed();
          }
          const productUpdate = await trx.updateTable('template_products').set({ status: result.templateStatus, review_target_version_id: null, updated_at: now }).where('id', '=', product.id).where('review_target_version_id', '=', version.version_id).where('status', '=', product.current_version_id ? product.status : 'rejected').where('current_version_id', 'is', product.current_version_id).executeTakeFirst();
          if (Number(productUpdate.numUpdatedRows) !== 1) throw changed();
          await trx.insertInto('template_versions').values({ version_id: input.newVersionId, template_id: product.id, version: input.newVersion, status: 'draft', revision: 1, package_license_json: JSON.stringify({ parserStatus: 'unknown', file: null, detected: null, excerpt: null }), license_text: null, scan_job_id: null, scan_status: 'pending', conflict_flag: 0, conflict_reasons_json: '[]', immutable: 0, created_at: now, submitted_at: null, approved_at: null }).execute();
          await trx.insertInto('audit_logs').values({ id: id('audit'), actor_type: 'user', actor_id: input.actorId, actor_email_snapshot: null, action: 'template.changes_requested', target_type: 'version', target_id: version.version_id, diff_json: JSON.stringify([{ field: 'status', before: version.status, after: result.oldVersionStatus }, { field: 'reviewTargetVersionId', before: version.version_id, after: null }, { field: 'newVersionId', before: null, after: input.newVersionId }, { field: 'templateStatus', before: product.status, after: result.templateStatus }]), reason: input.reason, request_id: null, ip: null, user_agent: null, at: now }).execute();
          return result;
        });
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code?.startsWith('SQLITE_BUSY') || code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') throw changed();
        throw error;
      }
    }
  };
}
