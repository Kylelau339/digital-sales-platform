import { z } from 'zod';

const DEV_SESSION_SECRET = 'development-only-session-secret-please-change';
const DEV_CSRF_SECRET = 'development-only-csrf-secret-please-change';
const booleanEnv = z.enum(['true', 'false']).default('false').transform(value => value === 'true');

export const env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_PATH: z.string().min(1).default('./var/motion-market.db'),
  PRIVATE_STORAGE_PATH: z.string().min(1).default('./var/private'),
  SESSION_SECRET: z.string().min(32).default(DEV_SESSION_SECRET),
  CSRF_SECRET: z.string().min(32).default(DEV_CSRF_SECRET),
  USE_FIXTURES: booleanEnv,
  ALLOWED_ORIGIN: z.url().default('http://localhost:5173'),
  MOCK_USDT_ENABLED: booleanEnv,
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_CONNECT_RETURN_URL: z.url().default('https://localhost:5173/seller/connect/return'),
  STRIPE_CONNECT_REFRESH_URL: z.url().default('https://localhost:5173/seller/connect/refresh'),
  STRIPE_CHECKOUT_SUCCESS_URL: z.url().default('https://localhost:5173/library?checkout=success'),
  STRIPE_CHECKOUT_CANCEL_URL: z.url().default('https://localhost:5173/checkout/cancel')
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production') {
    if (value.USE_FIXTURES) ctx.addIssue({ code: 'custom', path: ['USE_FIXTURES'], message: 'Production cannot enable fixtures.' });
    if (value.SESSION_SECRET === DEV_SESSION_SECRET || value.CSRF_SECRET === DEV_CSRF_SECRET) ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'Production requires unique session and CSRF secrets.' });
    if (!value.ALLOWED_ORIGIN.startsWith('https://')) ctx.addIssue({ code: 'custom', path: ['ALLOWED_ORIGIN'], message: 'Production requires an HTTPS origin.' });
  }
  if (value.NODE_ENV !== 'test' && value.MOCK_USDT_ENABLED) ctx.addIssue({ code: 'custom', path: ['MOCK_USDT_ENABLED'], message: 'Mock USDT must be disabled outside test.' });
  try {
    if (new URL(value.ALLOWED_ORIGIN).origin !== value.ALLOWED_ORIGIN) ctx.addIssue({ code: 'custom', path: ['ALLOWED_ORIGIN'], message: 'Origin must not contain a path or trailing slash.' });
  } catch { /* URL schema reports malformed values. */ }
});

export type Env = z.infer<typeof env>;
export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env { return env.parse(input); }
