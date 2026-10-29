import { httpClient } from './http-client';
import type { CatalogClient } from './models';
export const fixtureMode = __USE_FIXTURES__;
const selectedClient: Promise<CatalogClient> = __USE_FIXTURES__
  ? import('./fixture-client').then(module => module.fixtureClient)
  : Promise.resolve(httpClient);
export const apiClient: CatalogClient = {
  async listTemplates(signal) { return (await selectedClient).listTemplates(signal); },
  async workspace() { return (await selectedClient).workspace(); }
};

const license = (factor: number, scope: Record<string, string>) => ({ factor, label: { en: '' }, short: { en: '' }, desc: { en: '' }, scope });
export async function loadDesignData(): Promise<Record<string, unknown>> {
  if (__USE_FIXTURES__) return (await import('./design-fixture')).approvedDesignData();
  const { items } = await httpClient.listTemplates();
  return {
    today: new Date().toISOString(), templates: items, entitlements: [], complaints: [], submissions: [], audit: [],
    fx: { usdtPerUsd: 1, quoteTtlMs: 60000 },
    policy: { id: 'refund-policy-v2.1', version: 'v2.1', windowDays: 7, eligible: ['file_corrupted_or_inaccessible', 'materially_not_as_described', 'duplicate_purchase'], exclusions: ['already_downloaded', 'subjective_dissatisfaction'] },
    licenseTypes: {
      commercial_single_project: license(1, { commercial: 'yes', resale: 'no', redistribute: 'no', attribution: 'limited' }),
      commercial_multi_project: license(1.35, { commercial: 'yes', resale: 'limited', redistribute: 'no', attribution: 'limited' }),
      personal_use: license(.8, { commercial: 'no', resale: 'no', redistribute: 'no', attribution: 'no' }),
      custom: license(1, {})
    }
  };
}
