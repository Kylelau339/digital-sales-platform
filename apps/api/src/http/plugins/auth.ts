import type { FastifyRequest } from 'fastify';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import type { SessionRepository } from '../../repositories/ports/index.js';

export function optionalAuth(sessions: SessionRepository) {
  return async function auth(request: FastifyRequest): Promise<void> {
    const cookie = request.cookies.motion_session;
    if (!cookie) return;
    const unsigned = request.unsignCookie(cookie);
    if (!unsigned.valid || !unsigned.value) return;
    const session = await sessions.findValidById(unsigned.value, new Date().toISOString());
    if (session) request.authContext = { sessionId: session.id, userId: session.userId, csrfTokenHash: session.csrfTokenHash };
  };
}

export function requireAuth(request: FastifyRequest): { userId: string; sessionId: string } {
  if (!request.authContext) throw new DomainError(ERROR_CODES.AUTH_REQUIRED, 401, 'Authentication is required.');
  return request.authContext;
}
