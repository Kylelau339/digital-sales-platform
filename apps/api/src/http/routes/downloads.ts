import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import type { Database } from '../../db/types.js';
import { requireAuth } from '../plugins/auth.js';
import { createDownloadService } from '../../downloads/service.js';
import { createSqliteRepositories } from '../../repositories/sqlite/index.js';

export function registerDownloadRoutes(app: FastifyInstance, db: Kysely<Database>, privateRoot: string, signingSecret: string, clock?: () => Date): void {
  const downloads = createDownloadService(db, privateRoot, signingSecret, clock);
  const entitlements = createSqliteRepositories(db).entitlements;
  app.get('/api/v1/entitlements', async request => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0) }).strict().parse(request.query);
    const page = await entitlements.listByBuyer(requireAuth(request).userId, query);
    return { items: page.items, total: page.total, limit: query.limit, offset: query.offset };
  });
  app.post('/api/v1/entitlements/:entitlementId/downloads', { config: { sessionWrite: true } }, async request => {
    const { entitlementId } = z.object({ entitlementId: z.string().min(1).max(128) }).parse(request.params);
    const requestKey = request.headers['idempotency-key'];
    if (typeof requestKey !== 'string' || requestKey.length < 8 || requestKey.length > 128) throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 422, 'A valid Idempotency-Key is required.');
    return downloads.reserve(requireAuth(request).userId, entitlementId, requestKey);
  });
  app.get('/api/v1/downloads/:token', async (request, reply) => {
    const { token } = z.object({ token: z.string().min(1).max(2048) }).parse(request.params);
    const result = await downloads.redeem(token);
    return reply.header('content-type', result.mimeType).header('content-disposition', `attachment; filename="${result.filename.replace(/["\\\r\n]/g, '_')}"`).header('cache-control', 'no-store').send(result.payload);
  });
}
