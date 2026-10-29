import Fastify, { type FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { hash, verify } from 'argon2';
import { z, ZodError } from 'zod';
import { DomainError, ERROR_CODES } from '@shared/contracts/errors.js';
import type { User } from '@shared/contracts/domain.js';
import { id, nowUtc, plusDays } from '@shared/time.js';
import type { Kysely } from 'kysely';
import type { Database } from './db/types.js';
import { createSqliteRepositories } from './repositories/sqlite/index.js';
import { optionalAuth, requireAuth } from './http/plugins/auth.js';
import { assertWriteOrigin, requireCsrf } from './http/plugins/csrf.js';
import { hashToken, token } from './config/tokens.js';
import type { Env } from './config/env.js';
import { registerM1Routes } from './http/routes/m1-api.js';
import { registerM1ReviewRoutes } from './http/routes/m1-review.js';
import { createEmailVerification, type VerificationSender } from './auth/email-verification.js';
import { registerConnectService, type ConnectClient } from './connect/service.js';
import { createStripeConnectClient } from './connect/stripe-client.js';
import { createPaymentService, createStripeCheckoutClient, type CheckoutClient } from './payments/service.js';
import { registerDownloadRoutes } from './http/routes/downloads.js';

const credentials = z.object({ email: z.email().transform(value => value.trim().toLowerCase()), password: z.string().min(10).max(128) }).strict();
const registration = credentials.extend({ displayName: z.string().trim().min(1).max(80) });
const publicUser = (user: User) => ({ id: user.id, email: user.email, displayName: user.displayName, roles: user.roles, authStatus: user.authStatus });

export function createApp(db: Kysely<Database>, config: Env, options: { verificationSender?: VerificationSender; connectClient?: ConnectClient; checkoutClient?: CheckoutClient; clock?: () => Date } = {}) {
  const app = Fastify({ logger: config.NODE_ENV !== 'test', genReqId: () => id('req'), bodyLimit: 64 * 1024, routerOptions: { maxParamLength: 2048 } });
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    if (request.url === '/api/v1/webhooks/stripe/connect' || request.url === '/api/v1/webhooks/stripe') { (request as typeof request & { rawBody?: Buffer }).rawBody = body as Buffer; }
    try { done(null, JSON.parse((body as Buffer).toString('utf8'))); } catch (error) { done(error as Error, undefined); }
  });
  const repos = createSqliteRepositories(db);
  const emailVerification = createEmailVerification(db, config.CSRF_SECRET, options.verificationSender, options.clock);
  const connectClient = options.connectClient ?? (config.STRIPE_SECRET_KEY ? createStripeConnectClient(config) : undefined);
  const connectService = connectClient ? registerConnectService(db, connectClient, { webhookSecret: config.STRIPE_CONNECT_WEBHOOK_SECRET, returnUrl: config.STRIPE_CONNECT_RETURN_URL, refreshUrl: config.STRIPE_CONNECT_REFRESH_URL }) : null;
  const checkoutClient = options.checkoutClient ?? createStripeCheckoutClient(config.STRIPE_SECRET_KEY);
  const paymentService = checkoutClient ? createPaymentService(db, config.PRIVATE_STORAGE_PATH, checkoutClient, config.STRIPE_WEBHOOK_SECRET) : null;
  registerM1Routes(app, db, config.PRIVATE_STORAGE_PATH);
  registerM1ReviewRoutes(app, db, config.PRIVATE_STORAGE_PATH);
  app.register(cookie, { secret: config.SESSION_SECRET });
  app.register(rateLimit, { global: false });
  app.addHook('onRequest', optionalAuth(repos.sessions));
  const csrf = requireCsrf({ sessions: repos.sessions, env: config });
  app.addHook('preHandler', async (request, reply) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
    if (request.routeOptions.url === '/api/v1/webhooks/stripe/connect' || request.routeOptions.url === '/api/v1/webhooks/stripe') return;
    assertWriteOrigin(request, config);
    if (request.authContext) await csrf(request, reply);
    else if (request.routeOptions.config.sessionWrite) throw new DomainError(ERROR_CODES.AUTH_REQUIRED, 401, 'Authentication is required.');
  });
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'same-origin');
    if (request.url.includes('/auth/')) reply.header('cache-control', 'no-store');
  });
  registerDownloadRoutes(app, db, config.PRIVATE_STORAGE_PATH, config.CSRF_SECRET, options.clock);
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) return reply.code(error.status).send({ code: error.code, message: error.message, requestId: request.id, ...(error.details ? { details: error.details } : {}) });
    if (error instanceof ZodError) return reply.code(422).send({ code: ERROR_CODES.VALIDATION_FAILED, message: 'Request validation failed.', requestId: request.id, details: { issues: error.issues } });
    if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500) return reply.code(error.statusCode).send({ code: ERROR_CODES.VALIDATION_FAILED, message: error.message, requestId: request.id });
    request.log.error({ err: error }, 'Unhandled API error');
    return reply.code(500).send({ code: ERROR_CODES.INTERNAL_ERROR, message: 'An internal error occurred.', requestId: request.id });
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send({ code: ERROR_CODES.NOT_FOUND, message: 'Route not found.', requestId: request.id }));
  const setSession = async (userId: string, reply: FastifyReply): Promise<string> => {
    const csrfToken = token();
    const now = nowUtc();
    const session = await repos.sessions.create({ id: token(), userId, csrfTokenHash: hashToken(csrfToken, config.CSRF_SECRET), expiresAt: plusDays(now, 30), createdAt: now });
    reply.setCookie('motion_session', session.id, { signed: true, httpOnly: true, sameSite: 'strict', secure: config.NODE_ENV === 'production', path: '/', maxAge: 30 * 24 * 60 * 60 });
    return csrfToken;
  };
  const getCurrentUser = async (userId: string): Promise<User> => {
    const user = await repos.users.findById(userId);
    if (!user) throw new DomainError(ERROR_CODES.AUTH_REQUIRED, 401, 'Authentication is required.');
    if (['locked', 'disabled'].includes(user.authStatus)) throw new DomainError(ERROR_CODES.FORBIDDEN, 403, 'This account is not available.');
    return user;
  };
  if (connectService) {
    app.post('/api/v1/seller/connect/account', { config: { sessionWrite: true } }, async request => {
      const auth = requireAuth(request); const user = await getCurrentUser(auth.userId);
      if (user.authStatus !== 'verified' || !user.roles.includes('seller')) throw new DomainError(ERROR_CODES.FORBIDDEN, 403, 'Verified seller access is required.');
      const body = z.object({ idempotencyKey: z.string().trim().min(8).max(128) }).parse(request.body);
      return connectService.createAccount(user.id, user.email, body.idempotencyKey);
    });
    app.get('/api/v1/seller/connect/status', async request => {
      const auth = requireAuth(request); const user = await getCurrentUser(auth.userId);
      if (!user.roles.includes('seller')) throw new DomainError(ERROR_CODES.FORBIDDEN, 403, 'Seller access is required.');
      return { account: await connectService.status(user.id) };
    });
    app.post('/api/v1/seller/connect/onboarding-link', { config: { sessionWrite: true } }, async request => {
      const auth = requireAuth(request); const user = await getCurrentUser(auth.userId);
      if (user.authStatus !== 'verified' || !user.roles.includes('seller')) throw new DomainError(ERROR_CODES.FORBIDDEN, 403, 'Verified seller access is required.');
      return connectService.onboardingLink(user.id);
    });
    app.post('/api/v1/webhooks/stripe/connect', async request => {
      const raw = (request as typeof request & { rawBody?: Buffer }).rawBody?.toString('utf8') ?? '';
      const signature = request.headers['stripe-signature'];
      return connectService.webhook(raw, typeof signature === 'string' ? signature : undefined);
    });
  }

  if (paymentService) {
    app.post('/api/v1/checkout/sessions', { config: { sessionWrite: true } }, async request => {
      const auth = requireAuth(request); const user = await getCurrentUser(auth.userId);
      if (user.authStatus !== 'verified') throw new DomainError(ERROR_CODES.FORBIDDEN, 403, 'Verified email is required for checkout.');
      const body = z.object({ templateId: z.string().trim().min(1), licenseType: z.enum(['commercial_single_project','commercial_multi_project','personal_use','custom']) }).strict().parse(request.body);
      const requestKey = request.headers['idempotency-key'];
      if (typeof requestKey !== 'string' || requestKey.length < 8 || requestKey.length > 128) throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 422, 'A valid Idempotency-Key is required.');
      return paymentService.createCheckout(user.id, body.templateId, body.licenseType, requestKey);
    });
    app.post('/api/v1/webhooks/stripe', async request => {
      const raw = (request as typeof request & { rawBody?: Buffer }).rawBody?.toString('utf8') ?? '';
      const signature = request.headers['stripe-signature'];
      if (typeof signature !== 'string') throw new DomainError(ERROR_CODES.PAYMENT_WEBHOOK_INVALID, 400, 'Stripe signature is required.');
      return paymentService.fulfill(raw, signature);
    });
  }

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/api/v1/templates', async () => {
    const rows = await db.selectFrom('template_products').selectAll().where('status', '=', 'approved').where('current_version_id', 'is not', null).orderBy('published_at', 'desc').orderBy('id').execute();
    return { items: rows.map(row => ({ id: row.id, name: JSON.parse(row.name_json), summary: JSON.parse(row.summary_json), category: row.category, priceUsdCents: row.price_usd_cents, status: row.status, version: row.version, rating: row.rating, salesRecent: JSON.parse(row.sales_recent_json), licenseTypes: JSON.parse(row.license_types_json), currentVersionId: row.current_version_id })), total: rows.length };
  });
  app.get('/api/v1/refund-policy', async () => repos.policies.getCurrent());
  const limited = { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } };
  app.post('/api/v1/auth/register', limited, async (request, reply) => {
    const input = registration.parse(request.body);
    if (await repos.users.findByEmail(input.email)) throw new DomainError(ERROR_CODES.CONFLICT, 409, 'An account with this email already exists.');
    const user = await repos.users.create({ id: id('user'), email: input.email, passwordHash: await hash(input.password), displayName: input.displayName, roles: ['buyer'], now: nowUtc() });
    const csrfToken = await setSession(user.id, reply);
    if (options.verificationSender) await emailVerification.send(user.id);
    return reply.code(201).send({ user: publicUser(user), csrfToken, verificationRequired: true });
  });
  app.post('/api/v1/auth/login', limited, async (request, reply) => {
    const input = credentials.parse(request.body);
    const user = await repos.users.findByEmail(input.email);
    if (!user || !(await verify(user.passwordHash, input.password))) throw new DomainError(ERROR_CODES.AUTH_REQUIRED, 401, 'Email or password is incorrect.');
    await getCurrentUser(user.id);
    if (request.authContext) await repos.sessions.revoke(request.authContext.sessionId, nowUtc());
    const csrfToken = await setSession(user.id, reply);
    return reply.send({ user: publicUser(user), csrfToken });
  });
  app.post('/api/v1/auth/email-verification/send', { config: { sessionWrite: true } }, async request => {
    const auth = requireAuth(request);
    await emailVerification.send(auth.userId);
    return { ok: true };
  });
  app.post('/api/v1/auth/email-verification/verify', { config: { sessionWrite: true } }, async request => {
    const auth = requireAuth(request);
    const body = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(request.body);
    await emailVerification.verify(auth.userId, body.code);
    return { ok: true, user: publicUser(await getCurrentUser(auth.userId)) };
  });

  app.get('/api/v1/auth/me', async request => ({ user: publicUser(await getCurrentUser(requireAuth(request).userId)) }));
  app.get('/api/v1/auth/csrf', async (request, reply) => {
    const auth = requireAuth(request);
    const origin = request.headers.origin;
    const fetchSite = request.headers['sec-fetch-site'];
    if ((origin !== undefined && origin !== config.ALLOWED_ORIGIN) || fetchSite === 'cross-site') throw new DomainError(ERROR_CODES.CSRF_INVALID, 403, 'Origin is not allowed.');
    await getCurrentUser(auth.userId);
    const csrfToken = token();
    await repos.sessions.rotateCsrfToken(auth.sessionId, hashToken(csrfToken, config.CSRF_SECRET));
    return reply.send({ csrfToken });
  });
  app.post('/api/v1/auth/csrf', { config: { sessionWrite: true } }, async (request, reply) => {
    const auth = requireAuth(request);
    const csrfToken = token();
    await repos.sessions.rotateCsrfToken(auth.sessionId, hashToken(csrfToken, config.CSRF_SECRET));
    return reply.send({ csrfToken });
  });
  app.post('/api/v1/auth/logout', { config: { sessionWrite: true } }, async (request, reply) => {
    const auth = requireAuth(request);
    await repos.sessions.revoke(auth.sessionId, nowUtc());
    reply.clearCookie('motion_session', { path: '/' });
    return reply.send({ ok: true });
  });
  return app;
}

declare module 'fastify' { interface FastifyContextConfig { sessionWrite?: boolean; } }
