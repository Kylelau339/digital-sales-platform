import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, headers, seedPaidOrder, type Harness } from './helpers/m3';

let h: Harness;

beforeEach(async () => { h = await createHarness(); });
afterEach(async () => { await h.close(); });

async function takedown(id: string, mode: 'suspend' | 'remove', key = `takedown-${mode}`) {
  return h.app.inject({ method: 'POST', url: `/api/v1/admin/templates/${id}/takedown`, headers: headers(h.admin, key), payload: { mode, reason: 'Rights evidence requires removal from the marketplace.' } });
}

describe('M3 administrative takedown', () => {
  it('suspends an approved listing, hides it from the catalogue and blocks checkout', async () => {
    await seedPaidOrder(h);
    const before = await h.app.inject({ method: 'GET', url: '/api/v1/templates' });
    expect(before.json().items).toHaveLength(1);

    const response = await takedown('tpl_m3', 'suspend');
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ status: 'suspended', entitlementsRevoked: 0, replay: false });

    const after = await h.app.inject({ method: 'GET', url: '/api/v1/templates' });
    expect(after.json().items).toHaveLength(0);
    const product = await h.db.selectFrom('template_products').selectAll().where('id', '=', 'tpl_m3').executeTakeFirstOrThrow();
    expect(product.status).toBe('suspended');
    expect(product.current_version_id).toBe('ver_m3');
    const record = await h.db.selectFrom('template_takedowns').selectAll().executeTakeFirstOrThrow();
    expect(record).toMatchObject({ mode: 'suspend', previous_status: 'approved', entitlements_revoked: 0 });
    const audit = await h.db.selectFrom('audit_logs').selectAll().where('action', '=', 'template.taken_down').executeTakeFirstOrThrow();
    expect(audit.diff_json).toContain('entitlementsRevoked');

    const replay = await takedown('tpl_m3', 'suspend');
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ status: 'suspended', replay: true });
    expect(await h.db.selectFrom('template_takedowns').selectAll().execute()).toHaveLength(1);
  });

  it('removes a listing terminally, clears the current version and revokes entitlements', async () => {
    await seedPaidOrder(h);
    const response = await takedown('tpl_m3', 'remove');
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ status: 'removed', entitlementsRevoked: 1, replay: false });
    const product = await h.db.selectFrom('template_products').selectAll().where('id', '=', 'tpl_m3').executeTakeFirstOrThrow();
    expect(product).toMatchObject({ status: 'removed', current_version_id: null, review_target_version_id: null });
    const entitlement = await h.db.selectFrom('entitlements').selectAll().where('order_id', '=', 'order_m3').executeTakeFirstOrThrow();
    expect(entitlement.status).toBe('revoked');
    expect(entitlement.revoke_reason_public).toBe('Template removed from the marketplace');
    const removedAgain = await takedown('tpl_m3', 'remove');
    expect(removedAgain.json()).toMatchObject({ status: 'removed', replay: true });
  });

  it('enforces admin access and a meaningful reason', async () => {
    const forbidden = await h.app.inject({ method: 'POST', url: '/api/v1/admin/templates/tpl_m3/takedown', headers: headers(h.buyer, 'buyer-takedown'), payload: { mode: 'suspend', reason: 'Buyer cannot take this down.' } });
    expect(forbidden.statusCode).toBe(403);
    const short = await h.app.inject({ method: 'POST', url: '/api/v1/admin/templates/tpl_m3/takedown', headers: headers(h.admin, 'short-reason'), payload: { mode: 'suspend', reason: 'short' } });
    expect(short.statusCode).toBe(422);
  });
});
