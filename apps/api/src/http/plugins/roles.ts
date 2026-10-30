import type { FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import type { User } from '@shared/contracts/domain.js';
import type { Database } from '../../db/types.js';
import { createSqliteRepositories } from '../../repositories/sqlite/index.js';
import { requireAuth } from './auth.js';

export async function currentUser(db: Kysely<Database>, request: FastifyRequest): Promise<User> {
  const auth = requireAuth(request);
  const user = await createSqliteRepositories(db).users.findById(auth.userId);
  if (!user) throw new DomainError(ERROR_CODES.AUTH_REQUIRED, 401, 'Authentication is required.');
  if (['locked', 'disabled'].includes(user.authStatus)) throw new DomainError(ERROR_CODES.FORBIDDEN, 403, 'This account is not available.');
  return user;
}

export async function requireAdminUser(db: Kysely<Database>, request: FastifyRequest): Promise<User> {
  const user = await currentUser(db, request);
  if (!user.roles.includes('admin')) throw new DomainError(ERROR_CODES.FORBIDDEN, 403, 'Administrator access is required.');
  return user;
}

export async function requireVerifiedSellerUser(db: Kysely<Database>, request: FastifyRequest): Promise<User> {
  const user = await currentUser(db, request);
  if (user.authStatus !== 'verified' || !user.roles.includes('seller')) throw new DomainError(ERROR_CODES.FORBIDDEN, 403, 'Verified seller access is required.');
  return user;
}

export function requestMeta(request: FastifyRequest): { requestId: string | null; ip: string | null; userAgent: string | null } {
  return { requestId: request.id, ip: request.ip ?? null, userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null };
}
