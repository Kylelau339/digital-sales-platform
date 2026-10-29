import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import { COMPLAINT_REASONS } from '@shared/enums/domain.js';
import type { Database } from '../../db/types.js';
import { createSqliteRepositories } from '../../repositories/sqlite/index.js';
import { CreateComplaintUseCase } from '../../application/complaints/create-complaint.js';
import { requireAuth } from '../plugins/auth.js';
import { currentUser } from '../plugins/roles.js';

const bodySchema = z.object({ orderId: z.string().trim().min(1), entitlementId: z.string().trim().min(1).nullable().optional(), reason: z.enum(COMPLAINT_REASONS), description: z.string().trim().min(1).max(5000) }).strict();
const pageSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).default(0) });

export function registerM3ComplaintRoutes(app: FastifyInstance, db: Kysely<Database>, clock: () => Date = () => new Date()): void {
  const repos = createSqliteRepositories(db);

  app.get('/api/v1/complaints', async request => {
    const auth = requireAuth(request);
    await currentUser(db, request);
    return repos.complaints.listByBuyer(auth.userId, pageSchema.parse(request.query));
  });

  app.post('/api/v1/complaints', { config: { sessionWrite: true } }, async (request, reply) => {
    const auth = requireAuth(request);
    await currentUser(db, request);
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 8 || key.length > 128) throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 422, 'A valid Idempotency-Key is required.');
    const body = bodySchema.parse(request.body);
    const existing = await db.selectFrom('complaints').selectAll().where('idempotency_key', '=', key).executeTakeFirst();
    if (existing) {
      if (existing.order_id !== body.orderId || existing.reason !== body.reason || existing.description !== body.description) throw new DomainError(ERROR_CODES.IDEMPOTENCY_CONFLICT, 409, 'Idempotency key belongs to a different complaint request.');
      const complaint = await repos.complaints.findById(existing.id);
      return reply.code(200).send({ complaint });
    }
    const useCase = new CreateComplaintUseCase({ orders: repos.orders, complaints: repos.complaints, entitlements: repos.entitlements });
    const complaint = await useCase.execute({ buyerId: auth.userId, orderId: body.orderId, entitlementId: body.entitlementId ?? null, reason: body.reason, description: body.description, idempotencyKey: key, now: clock().toISOString() });
    return reply.code(201).send({ complaint });
  });
}
