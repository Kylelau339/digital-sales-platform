import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql, type Kysely } from 'kysely';
import { createDb } from '../../apps/api/src/db/client.js';
import { migrate } from '../../apps/api/src/db/cli.js';
import type { Database } from '../../apps/api/src/db/types.js';
import { createSqliteRepositories } from '../../apps/api/src/repositories/sqlite/index.js';
import { createSqliteRequestChangesRepository } from '../../apps/api/src/repositories/sqlite/m1-request-changes.js';
import { requestChanges, type RequestChangesInput } from '../../apps/api/src/application/templates/request-changes.js';

const now = '2026-10-01T00:00:00.000Z';
let folder: string;
let db: Kysely<Database>;
const input = (overrides: Partial<RequestChangesInput> = {}): RequestChangesInput => ({ versionId: 'review', expectedRevision: 1, newVersionId: 'new', newVersion: '2.0.0', actorId: 'seller', reason: 'Please revise the package', ...overrides });
const run = (overrides: Partial<RequestChangesInput> = {}) => requestChanges(createSqliteRequestChangesRepository(db), input(overrides));

beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'motion-changes-'));
  db = createDb(join(folder, 'db.sqlite'));
  await migrate(db);
  const repos = createSqliteRepositories(db);
  await repos.users.create({ id: 'seller', email: 'seller@example.com', passwordHash: 'unused', displayName: 'Seller', roles: ['seller'], now });
  await repos.products.createDraft({ id: 'tpl', sellerId: 'seller', name: { zh: 'x', en: 'x' }, summary: { zh: 'x', en: 'x' }, category: 'intro', licenseTypes: ['commercial_single_project'], licensePricing: [{ licenseType: 'commercial_single_project', factor: '1', priceUsdCents: 1000 }], priceUsdCents: 1000, version: '1.0.0', now });
  await repos.versions.createDraft({ versionId: 'review', templateId: 'tpl', version: '1.0.0', files: [], packageLicense: { parserStatus: 'unknown', file: null, detected: null, excerpt: null }, licenseText: null, now });
  await db.updateTable('template_versions').set({ status: 'pending_license_review', immutable: 1, submitted_at: now }).where('version_id', '=', 'review').execute();
  await db.updateTable('template_products').set({ status: 'pending_license_review', review_target_version_id: 'review' }).where('id', '=', 'tpl').execute();
});
afterEach(async () => { await db.destroy(); rmSync(folder, { recursive: true, force: true }); });

async function assertUnchanged() {
  expect(await db.selectFrom('template_versions').select(['version_id', 'status', 'revision']).execute()).toEqual([{ version_id: 'review', status: 'pending_license_review', revision: 1 }]);
  expect(await db.selectFrom('template_products').select(['status', 'current_version_id', 'review_target_version_id']).executeTakeFirstOrThrow()).toEqual({ status: 'pending_license_review', current_version_id: null, review_target_version_id: 'review' });
  expect(await db.selectFrom('audit_logs').selectAll().execute()).toHaveLength(0);
}

describe('SQLite request changes', () => {
  it('returns first listing to draft and appends an audit with a fresh version', async () => {
    expect(await run()).toMatchObject({ oldVersionStatus: 'rejected', newVersionStatus: 'draft', templateStatus: 'draft', currentVersionId: null });
    const old = await db.selectFrom('template_versions').selectAll().where('version_id', '=', 'review').executeTakeFirstOrThrow();
    expect(old).toMatchObject({ status: 'rejected', revision: 2, immutable: 1, submitted_at: now });
    const draft = await db.selectFrom('template_versions').selectAll().where('version_id', '=', 'new').executeTakeFirstOrThrow();
    expect(draft).toMatchObject({ template_id: 'tpl', version: '2.0.0', status: 'draft', revision: 1, immutable: 0, scan_status: 'pending', scan_job_id: null, submitted_at: null, approved_at: null });
    expect(JSON.parse(draft.package_license_json).parserStatus).toBe('unknown');
    expect(await db.selectFrom('template_products').select(['status', 'current_version_id', 'review_target_version_id']).executeTakeFirstOrThrow()).toEqual({ status: 'draft', current_version_id: null, review_target_version_id: null });
    const audit = await db.selectFrom('audit_logs').selectAll().executeTakeFirstOrThrow();
    expect(audit).toMatchObject({ actor_id: 'seller', action: 'template.changes_requested', target_type: 'version', target_id: 'review', reason: 'Please revise the package' });
    expect(JSON.parse(audit.diff_json)).toContainEqual({ field: 'newVersionId', before: null, after: 'new' });
  });
  it('preserves the current approved version and its product status', async () => {
    const old = await db.selectFrom('template_versions').selectAll().where('version_id', '=', 'review').executeTakeFirstOrThrow();
    await db.insertInto('template_versions').values({ ...old, version_id: 'published', version: '0.9.0', status: 'approved', approved_at: now }).execute();
    await db.updateTable('template_products').set({ status: 'approved', current_version_id: 'published' }).execute();
    const before = await db.selectFrom('template_versions').selectAll().where('version_id', '=', 'published').executeTakeFirstOrThrow();
    expect(await run()).toMatchObject({ currentVersionId: 'published', currentVersionStatus: 'approved', templateStatus: 'approved' });
    expect(await db.selectFrom('template_versions').selectAll().where('version_id', '=', 'published').executeTakeFirstOrThrow()).toEqual(before);
    expect(await db.selectFrom('template_products').select(['status', 'current_version_id', 'review_target_version_id']).executeTakeFirstOrThrow()).toEqual({ status: 'approved', current_version_id: 'published', review_target_version_id: null });
  });
  it('rejects stale revision, missing review, and invalid input without writes', async () => {
    await expect(run({ expectedRevision: 2 })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(run({ versionId: 'missing' })).rejects.toMatchObject({ code: 'REVIEW_NOT_FOUND' });
    await expect(run({ reason: 'short' })).rejects.toMatchObject({ code: 'REASON_TOO_SHORT' });
    await assertUnchanged();
  });
  it('rejects replaced review targets', async () => {
    await db.updateTable('template_products').set({ review_target_version_id: null }).execute();
    await expect(run()).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await db.selectFrom('template_versions').selectAll().execute()).toHaveLength(1);
    expect(await db.selectFrom('audit_logs').selectAll().execute()).toHaveLength(0);
  });
  it('allows only one concurrent request', async () => {
    const results = await Promise.allSettled([run(), run({ newVersionId: 'other', newVersion: '3.0.0' })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(await db.selectFrom('template_versions').selectAll().execute()).toHaveLength(2);
    expect(await db.selectFrom('audit_logs').selectAll().execute()).toHaveLength(1);
  });
  it('allows only one concurrent request across SQLite connections', async () => {
    const otherDb = createDb(join(folder, 'db.sqlite'));
    try {
      const results = await Promise.allSettled([
        run(),
        requestChanges(createSqliteRequestChangesRepository(otherDb), input({ newVersionId: 'other', newVersion: '3.0.0' }))
      ]);
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
      const failure = results.find(result => result.status === 'rejected');
      expect(failure && failure.status === 'rejected' && failure.reason).toMatchObject({ code: 'CONFLICT' });
      expect(await db.selectFrom('template_versions').selectAll().execute()).toHaveLength(2);
      expect(await db.selectFrom('audit_logs').selectAll().execute()).toHaveLength(1);
    } finally {
      await otherDb.destroy();
    }
  });
  it('rolls back on duplicate version labels', async () => {
    await expect(run({ newVersion: '1.0.0' })).rejects.toMatchObject({ code: 'CONFLICT' });
    await assertUnchanged();
  });
  it('rolls back all writes if audit insertion fails', async () => {
    await sql`CREATE TRIGGER fail_changes_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit failure'); END`.execute(db);
    await expect(run()).rejects.toBeDefined();
    await assertUnchanged();
  });
});
