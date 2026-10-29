import type { Kysely } from 'kysely';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import { id, nowUtc } from '@shared/time.js';
import type { Database } from '../db/types.js';
import { mapProduct } from '../repositories/sqlite/mapping.js';

export interface TakedownActor { id: string; email: string | null; }
export interface TakedownMeta { requestId: string | null; ip: string | null; userAgent: string | null; }
export type TakedownMode = 'suspend' | 'remove';

export function createTakedownService(db: Kysely<Database>) {
  return {
    async execute(input: { templateId: string; mode: TakedownMode; reason: string; actor: TakedownActor; meta: TakedownMeta }): Promise<{ templateId: string; status: string; entitlementsRevoked: number; replay: boolean }> {
      const reason = input.reason.trim();
      if (reason.length < 8) throw new DomainError(ERROR_CODES.REASON_TOO_SHORT, 422, 'A takedown reason of at least 8 characters is required.');
      const at = nowUtc();
      return db.transaction().execute(async trx => {
        const productRow = await trx.selectFrom('template_products').selectAll().where('id', '=', input.templateId).executeTakeFirst();
        const product = productRow ? mapProduct(productRow) : null;
        if (!product) throw new DomainError(ERROR_CODES.NOT_FOUND, 404, 'Template not found.');
        if (product.status === 'removed') return { templateId: product.id, status: product.status, entitlementsRevoked: 0, replay: true };
        if (input.mode === 'suspend') {
          if (product.status === 'suspended') return { templateId: product.id, status: product.status, entitlementsRevoked: 0, replay: true };
          if (product.status !== 'approved') throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Only an approved template can be suspended.');
          const changed = await trx.updateTable('template_products').set({ status: 'suspended', updated_at: at }).where('id', '=', product.id).where('status', '=', 'approved').executeTakeFirst();
          if (Number(changed.numUpdatedRows) !== 1) throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Template state has changed.');
        } else {
          const changed = await trx.updateTable('template_products').set({ status: 'removed', current_version_id: null, review_target_version_id: null, updated_at: at }).where('id', '=', product.id).where('status', '!=', 'removed').executeTakeFirst();
          if (Number(changed.numUpdatedRows) !== 1) throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Template state has changed.');
        }
        let entitlementsRevoked = 0;
        if (input.mode === 'remove') {
          const revoked = await trx.updateTable('entitlements').set({ status: 'revoked', revoke_reason_public: 'Template removed from the marketplace', revoke_reason_internal: reason, updated_at: at }).where('template_id', '=', product.id).where('status', '!=', 'revoked').executeTakeFirst();
          entitlementsRevoked = Number(revoked.numUpdatedRows);
        }
        await trx.insertInto('template_takedowns').values({ id: id('takedown'), template_id: product.id, mode: input.mode, reason, actor_id: input.actor.id, previous_status: product.status, entitlements_revoked: entitlementsRevoked, created_at: at }).execute();
        await trx.insertInto('audit_logs').values({ id: id('audit'), actor_type: 'user', actor_id: input.actor.id, actor_email_snapshot: input.actor.email, action: 'template.taken_down', target_type: 'template', target_id: product.id, diff_json: JSON.stringify([{ field: 'status', before: product.status, after: input.mode === 'suspend' ? 'suspended' : 'removed' }, { field: 'mode', before: null, after: input.mode }, { field: 'currentVersionId', before: product.currentVersionId, after: input.mode === 'remove' ? null : product.currentVersionId }, { field: 'entitlementsRevoked', before: 0, after: entitlementsRevoked }]), reason, request_id: input.meta.requestId, ip: input.meta.ip, user_agent: input.meta.userAgent, at }).execute();
        return { templateId: product.id, status: input.mode === 'suspend' ? 'suspended' : 'removed', entitlementsRevoked, replay: false };
      });
    }
  };
}
