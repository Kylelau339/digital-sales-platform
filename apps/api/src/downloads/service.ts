import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import { id } from '@shared/time.js';
import type { Database } from '../db/types.js';
import { assertCanDownload } from '../domain/entitlements/download-guard.js';
import { mapEntitlement } from '../repositories/sqlite/mapping.js';
import { LocalPrivateStorage } from '../storage/local-private-storage.js';

const DOWNLOAD_TTL_MS = 5 * 60 * 1000;
const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');

export function createDownloadService(db: Kysely<Database>, privateRoot: string, signingSecret: string, clock: () => Date = () => new Date()) {
  const storage = new LocalPrivateStorage(privateRoot);
  const signature = (payload: string) => createHmac('sha256', signingSecret).update(`motion-download:v1:${payload}`).digest('base64url');
  const createToken = (reservationId: string, expiresAt: string) => {
    const payload = Buffer.from(JSON.stringify({ reservationId, expiresAt })).toString('base64url');
    return `${payload}.${signature(payload)}`;
  };
  const parseToken = (token: string) => {
    const [payload, supplied, ...extra] = token.split('.');
    if (!payload || !supplied || extra.length) throw new DomainError(ERROR_CODES.DOWNLOAD_TOKEN_EXPIRED, 404, 'Download link is invalid or expired.');
    const expected = Buffer.from(signature(payload));
    const actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new DomainError(ERROR_CODES.DOWNLOAD_TOKEN_EXPIRED, 404, 'Download link is invalid or expired.');
    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { reservationId?: unknown; expiresAt?: unknown };
      if (typeof claims.reservationId !== 'string' || typeof claims.expiresAt !== 'string' || !Number.isFinite(Date.parse(claims.expiresAt)) || Date.parse(claims.expiresAt) <= clock().getTime()) throw new Error('invalid claims');
      return { reservationId: claims.reservationId, expiresAt: new Date(claims.expiresAt).toISOString() };
    } catch {
      throw new DomainError(ERROR_CODES.DOWNLOAD_TOKEN_EXPIRED, 404, 'Download link is invalid or expired.');
    }
  };
  const artifactFor = async (versionId: string, connection: Kysely<Database> = db) => {
    const file = await connection.selectFrom('template_files').selectAll().where('version_id', '=', versionId).where('kind', '=', 'motion_package').where('artifact_status', '=', 'sanitized').executeTakeFirst();
    if (!file) throw new DomainError(ERROR_CODES.DELIVERY_INTEGRITY_FAILED, 409, 'Sanitized delivery artifact is not available.');
    const artifact = await storage.stat(file.storage_key);
    if (!artifact || artifact.sizeBytes !== file.size_bytes || artifact.sha256 !== file.sha256) throw new DomainError(ERROR_CODES.DELIVERY_INTEGRITY_FAILED, 409, 'Delivery artifact integrity check failed.');
    return file;
  };
  const assertDeliveryAvailable = async (versionId: string, templateId: string, connection: Kysely<Database> = db) => {
    const version = await connection.selectFrom('template_versions').innerJoin('template_products', 'template_products.id', 'template_versions.template_id').select(['template_versions.version_id', 'template_versions.status', 'template_versions.immutable', 'template_versions.scan_status', 'template_products.status as product_status']).where('template_versions.version_id', '=', versionId).where('template_versions.template_id', '=', templateId).executeTakeFirst();
    if (!version || version.status !== 'approved' || version.immutable !== 1 || version.scan_status !== 'passed' || version.product_status !== 'approved') throw new DomainError(ERROR_CODES.DELIVERY_INTEGRITY_FAILED, 409, 'Template is no longer available for download.');
    return artifactFor(versionId, connection);
  };
  const reserveWriter = async (trx: Kysely<Database>) => {
    await sql`UPDATE schema_migrations SET applied_at=applied_at WHERE name='__repository_lock__'`.execute(trx);
  };

  return {
    async reserve(buyerId: string, entitlementId: string, requestKey: string) {
      const current = await db.selectFrom('entitlements').innerJoin('orders', 'orders.id', 'entitlements.order_id').select(['entitlements.version_id', 'entitlements.template_id', 'orders.buyer_id']).where('entitlements.id', '=', entitlementId).executeTakeFirst();
      if (!current) throw new DomainError(ERROR_CODES.ENTITLEMENT_NOT_FOUND, 404, 'Entitlement not found.');
      await assertDeliveryAvailable(current.version_id, current.template_id);
      const nowDate = clock();
      const now = nowDate.toISOString();
      const expiresAt = new Date(nowDate.getTime() + DOWNLOAD_TTL_MS).toISOString();
      const reservation = await db.transaction().execute(async trx => {
        await reserveWriter(trx);
        const previous = await trx.selectFrom('download_reservations').selectAll().where('entitlement_id', '=', entitlementId).where('request_key', '=', requestKey).executeTakeFirst();
        if (previous) {
          if (previous.buyer_id !== buyerId) throw new DomainError(ERROR_CODES.FORBIDDEN, 403, 'Download request key belongs to another buyer.');
          if (previous.status !== 'issued' || Date.parse(previous.expires_at) <= nowDate.getTime()) throw new DomainError(ERROR_CODES.DOWNLOAD_TOKEN_USED, 409, 'This download reservation is no longer available.');
          return { token: createToken(previous.id, previous.expires_at), expiresAt: previous.expires_at };
        }
        const row = await trx.selectFrom('entitlements').innerJoin('orders', 'orders.id', 'entitlements.order_id').selectAll('entitlements').select('orders.buyer_id as buyer_id').where('entitlements.id', '=', entitlementId).executeTakeFirst();
        if (!row || row.buyer_id !== buyerId) throw new DomainError(ERROR_CODES.ENTITLEMENT_NOT_FOUND, 404, 'Entitlement not found.');
        const entitlement = mapEntitlement(row);
        assertCanDownload(entitlement, now);
        const reservationId = id('dlr');
        const token = createToken(reservationId, expiresAt);
        await trx.insertInto('download_reservations').values({ id: reservationId, entitlement_id: entitlementId, buyer_id: buyerId, version_id: entitlement.versionId, request_key: requestKey, token_hash: sha256(token), status: 'issued', created_at: now, expires_at: expiresAt, consumed_at: null }).execute();
        return { token, expiresAt };
      });
      return { downloadUrl: `/api/v1/downloads/${encodeURIComponent(reservation.token)}`, expiresAt: reservation.expiresAt };
    },
    async redeem(token: string) {
      const claims = parseToken(token);
      const reservationSnapshot = await db.selectFrom('download_reservations').selectAll().where('id', '=', claims.reservationId).executeTakeFirst();
      if (!reservationSnapshot || reservationSnapshot.token_hash !== sha256(token) || reservationSnapshot.expires_at !== claims.expiresAt || reservationSnapshot.status !== 'issued' || Date.parse(reservationSnapshot.expires_at) <= clock().getTime()) throw new DomainError(ERROR_CODES.DOWNLOAD_TOKEN_USED, 409, 'Download link is invalid, expired, or already used.');
      const entitlementSnapshot = await db.selectFrom('entitlements').select('template_id').where('id', '=', reservationSnapshot.entitlement_id).executeTakeFirst();
      if (!entitlementSnapshot) throw new DomainError(ERROR_CODES.ENTITLEMENT_NOT_FOUND, 404, 'Entitlement not found.');
      const file = await assertDeliveryAvailable(reservationSnapshot.version_id, entitlementSnapshot.template_id);
      const payload = await storage.readBuffer(file.storage_key);
      if (payload.byteLength !== file.size_bytes || sha256(payload) !== file.sha256) throw new DomainError(ERROR_CODES.DELIVERY_INTEGRITY_FAILED, 409, 'Delivery artifact integrity check failed.');
      return db.transaction().execute(async trx => {
        await reserveWriter(trx);
        const reservation = await trx.selectFrom('download_reservations').selectAll().where('id', '=', claims.reservationId).executeTakeFirst();
        if (!reservation || reservation.token_hash !== sha256(token) || reservation.expires_at !== claims.expiresAt || reservation.status !== 'issued' || Date.parse(reservation.expires_at) <= clock().getTime()) throw new DomainError(ERROR_CODES.DOWNLOAD_TOKEN_USED, 409, 'Download link is invalid, expired, or already used.');
        const row = await trx.selectFrom('entitlements').innerJoin('orders', 'orders.id', 'entitlements.order_id').innerJoin('template_products', 'template_products.id', 'entitlements.template_id').selectAll('entitlements').select(['orders.buyer_id as buyer_id', 'template_products.status as product_status']).where('entitlements.id', '=', reservation.entitlement_id).executeTakeFirst();
        if (!row || row.buyer_id !== reservation.buyer_id) throw new DomainError(ERROR_CODES.ENTITLEMENT_NOT_FOUND, 404, 'Entitlement not found.');
        if (row.product_status !== 'approved') throw new DomainError(ERROR_CODES.DELIVERY_INTEGRITY_FAILED, 409, 'Template is no longer available for download.');
        const currentVersion = await trx.selectFrom('template_versions').select(['status', 'immutable', 'scan_status']).where('version_id', '=', reservation.version_id).executeTakeFirst();
        if (!currentVersion || currentVersion.status !== 'approved' || currentVersion.immutable !== 1 || currentVersion.scan_status !== 'passed') throw new DomainError(ERROR_CODES.DELIVERY_INTEGRITY_FAILED, 409, 'Template version is no longer available for download.');
        assertCanDownload(mapEntitlement(row), clock().toISOString());
        const at = clock().toISOString();
        const nextCount = row.download_count + 1;
        const updated = await trx.updateTable('entitlements').set({ download_count: nextCount, status: nextCount >= row.max_downloads ? 'exhausted' : 'active', last_downloaded_at: at, updated_at: at }).where('id', '=', row.id).where('download_count', '=', row.download_count).where('status', '=', 'active').executeTakeFirst();
        if (Number(updated.numUpdatedRows) !== 1) throw new DomainError(ERROR_CODES.CONFLICT, 409, 'Entitlement changed while downloading.');
        const consumed = await trx.updateTable('download_reservations').set({ status: 'consumed', consumed_at: at }).where('id', '=', reservation.id).where('status', '=', 'issued').executeTakeFirst();
        if (Number(consumed.numUpdatedRows) !== 1) throw new DomainError(ERROR_CODES.DOWNLOAD_TOKEN_USED, 409, 'Download link has already been used.');
        return { payload, filename: file.filename, mimeType: file.mime_type };
      });
    }
  };
}
