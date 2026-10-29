import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node'
  },
  resolve: { alias: { '@shared': new URL('./packages/shared/src', import.meta.url).pathname, '@api': new URL('./apps/api/src', import.meta.url).pathname } }
});
