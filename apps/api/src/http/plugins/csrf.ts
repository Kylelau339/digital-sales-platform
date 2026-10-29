import type { FastifyReply, FastifyRequest } from 'fastify';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import type { SessionRepository } from '../../repositories/ports/index.js';
import { matchesToken } from '../../config/tokens.js';
import type { Env } from '../../config/env.js';

export interface AuthContext { sessionId: string; userId: string; csrfTokenHash: string; }
declare module 'fastify' { interface FastifyRequest { authContext?: AuthContext; } }

export function assertWriteOrigin(request: FastifyRequest, config: Env): void {
  if (request.headers.origin !== config.ALLOWED_ORIGIN || request.headers['sec-fetch-site'] === 'cross-site') {
    throw new DomainError(ERROR_CODES.CSRF_INVALID, 403, 'The request origin is not allowed.');
  }
}

export function requireCsrf(options: { sessions: SessionRepository; env: Env }) {
  return async function csrf(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    assertWriteOrigin(request, options.env);
    const auth = request.authContext;
    if (!auth) throw new DomainError(ERROR_CODES.AUTH_REQUIRED, 401, 'Authentication is required.');
    const value = request.headers['x-csrf-token'];
    if (typeof value !== 'string' || !matchesToken(value, auth.csrfTokenHash, options.env.CSRF_SECRET)) {
      throw new DomainError(ERROR_CODES.CSRF_INVALID, 403, 'The session CSRF token is invalid.');
    }
  };
}
