import { describe, expect, it } from 'vitest';
import { assertCanDownload } from '../../apps/api/src/domain/entitlements/download-guard.js';
import type { Entitlement } from '@shared/contracts/domain.js';

const entitlement = (status: Entitlement['status']): Entitlement => ({ id: 'ent_1', orderId: 'ord_1', templateId: 'tpl_1', versionId: 'ver_1', licenseType: 'personal_use', maxDownloads: 10, downloadCount: 0, expiresAt: '2027-01-01T00:00:00.000Z', status, reissuedFromId: null, reissuedToId: null, revokeReasonPublic: null, revokeReasonInternal: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });

describe('entitlement M0 download contract', () => {
  it('rejects reissued entitlements', () => expect(() => assertCanDownload(entitlement('reissued'), '2026-06-01T00:00:00.000Z')).toThrowError(/reissued/));
  it('rejects revoked entitlements', () => expect(() => assertCanDownload(entitlement('revoked'), '2026-06-01T00:00:00.000Z')).toThrowError(/revoked/));
  it('rejects exhausted entitlements', () => expect(() => assertCanDownload({ ...entitlement('active'), downloadCount: 10 }, '2026-06-01T00:00:00.000Z')).toThrowError(/no downloads/));
});
