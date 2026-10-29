import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../../db/types.js';
import { requireVerifiedSellerUser } from '../plugins/roles.js';
import type { createEarningsService } from '../../seller/earnings.js';

const querySchema = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict();

export function registerM3SellerRoutes(app: FastifyInstance, db: Kysely<Database>, earningsService: ReturnType<typeof createEarningsService>): void {
  app.get('/api/v1/seller/earnings', async request => {
    const user = await requireVerifiedSellerUser(db, request);
    const query = querySchema.parse(request.query);
    return earningsService.get(user.id, query.from, query.to);
  });
}
