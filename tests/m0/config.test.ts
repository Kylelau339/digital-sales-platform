import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../apps/api/src/config/env.js';

describe('M0 startup configuration', () => {
  it('defaults fixtures and mock USDT to off', () => {
    expect(loadEnv({ NODE_ENV: 'test' }).USE_FIXTURES).toBe(false);
    expect(loadEnv({ NODE_ENV: 'test' }).MOCK_USDT_ENABLED).toBe(false);
  });
  it('hard-disables mock USDT outside test', () => {
    expect(() => loadEnv({ NODE_ENV: 'development', MOCK_USDT_ENABLED: 'true' })).toThrow();
    expect(loadEnv({ NODE_ENV: 'test', MOCK_USDT_ENABLED: 'true' }).MOCK_USDT_ENABLED).toBe(true);
  });
  it('rejects production fixture mode and default secrets', () => {
    expect(() => loadEnv({ NODE_ENV: 'production', USE_FIXTURES: 'true' })).toThrow();
    expect(() => loadEnv({ NODE_ENV: 'production', ALLOWED_ORIGIN: 'https://motion.example' })).toThrow();
    expect(loadEnv({ NODE_ENV: 'production', ALLOWED_ORIGIN: 'https://motion.example', SESSION_SECRET: 's'.repeat(48), CSRF_SECRET: 'c'.repeat(48), EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example', SMTP_USER: 'user', SMTP_PASS: 'pass' }).USE_FIXTURES).toBe(false);
  });
});
