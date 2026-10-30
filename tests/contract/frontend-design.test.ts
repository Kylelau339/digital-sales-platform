import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createPresentation } from '../../apps/web/src/presentation/render-functions.js';
import { resources, locales } from '../../apps/web/src/lib/i18n/i18n';
import { mockData } from '../../apps/web/src/lib/api/mock-fixture';

function files(root: string): string[] { return readdirSync(root, { withFileTypes: true }).flatMap(file => file.isDirectory() ? files(join(root, file.name)) : [join(root, file.name)]); }
const dictionaries = Object.fromEntries(Object.entries(resources).map(([locale, bundle]) => [locale, Object.fromEntries(Object.entries(bundle.translation).map(([key, value]) => [key, value.replace(/\{\{(\w+)\}\}/g, '{$1}')]))]));

describe('frontend design and fixture contracts', () => {
  it('keeps the project stylesheet and header/footer structure self-contained', () => {
    const stylesheet = readFileSync('apps/web/src/styles.css', 'utf8');
    expect(stylesheet.length).toBeGreaterThan(1000);
    const chrome = readFileSync('apps/web/src/presentation/chrome.ts', 'utf8');
    expect(chrome).toContain('header-search');
    expect(chrome).toContain('cat-nav od-rail');
    expect(chrome).toContain('footer-col');
  });
  it('renders all six final-design views in every locale from generated mock data', () => {
    const data = mockData();
    for (const locale of locales) for (const route of ['market', 'detail', 'seller', 'library', 'complaints', 'admin', 'earnings']) {
      const html = createPresentation(data, dictionaries).render({ route, lang: locale, signedIn: true, loading: false, detailId: 'mock-template', earnings: data.earnings, admin: { tab: 'records', complaints: data.adminComplaints, templates: data.adminTemplates }, isAdmin: true, isSeller: true });
      expect(html.length).toBeGreaterThan(200);
      expect(html).not.toContain('undefined');
      if (route === 'library') expect(html).toContain('class="lib-item"');
      if (route === 'market') expect(html).toContain('sort-control');
      if (route === 'earnings') expect(html).toContain('metric-strip');
      if (route === 'admin') expect(html).toContain('adm-records-grid');
    }
  });
  it('provides all six new complaint reason keys and the manual-window exemption in four languages', () => {
    for (const locale of locales) {
      const translations = resources[locale]!.translation;
      for (const reason of ['unauthorized_distribution', 'copyright', 'trademark', 'malware', 'misleading_license', 'other']) expect(translations[`cp.reason.${reason}`]).toBeTruthy();
      expect(translations['rf.manual']).toContain('7');
    }
  });
  it('keeps fixtures out of server routes and behind the compile-time false branch', () => {
    for (const file of files(join('apps', 'api', 'src')).filter(file => /\.(ts|js)$/.test(file))) expect(readFileSync(file, 'utf8')).not.toMatch(/(?:from\s*|import\s*\()\s*['"][^'"]*fixtures/);
    const client = readFileSync('apps/web/src/lib/api/client.ts', 'utf8');
    expect(client).toContain('if (__USE_FIXTURES__)');
    expect(client).not.toMatch(/import\s+\{[^}]*MB_DATA/);
    expect(readFileSync('apps/web/src/lib/api/mock-fixture.ts', 'utf8')).toContain('Generated fixture');
  });
  it('does not execute original prototype business mutations in the presentation adapter', () => {
    const source = readFileSync('apps/web/src/presentation/render-functions.js', 'utf8');
    expect(source).not.toMatch(/function (?:payCheckout|downloadEntitlement|submitSell|approveSubmission|confirmRefund|submitComplaint)\s*\(/);
    expect(source).not.toContain('addEventListener');
    expect(source).not.toContain('downloadCount +=');
  });
});
