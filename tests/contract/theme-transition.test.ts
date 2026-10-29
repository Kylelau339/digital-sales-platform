import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('theme reveal transition', () => {
  it('uses the clicked button as the reveal origin and keeps a reduced-motion fallback', () => {
    const source = readFileSync('apps/web/src/main.tsx', 'utf8');
    expect(source).toContain('getBoundingClientRect');
    expect(source).toContain('startViewTransition');
    expect(source).toContain('prefers-reduced-motion: reduce');
    expect(source).toContain('--theme-x');
    expect(source).toContain('--theme-r');
  });
  it('has a circular root reveal animation in the approved stylesheet', () => {
    const source = readFileSync('apps/web/src/styles.css', 'utf8');
    expect(source).toContain('::view-transition-new(root)');
    expect(source).toContain('clip-path: circle(0px at var(--theme-x');
    expect(source).toContain('mb-theme-reveal');
  });
});
