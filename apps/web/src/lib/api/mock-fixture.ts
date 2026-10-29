import type { CatalogClient, ComplaintItem, LibraryItem, SubmissionItem, TemplateItem, Workspace } from './models';

const image = (name: string) => `/assets/stock/${name}.svg`;
const text = (en: string, zh = en) => ({ en, zh, 'zh-TW': zh, ja: en, ko: en });

export const mockTemplates: TemplateItem[] = [
  {
    id: 'mock-template', name: text('Signal Intro', '訊號片頭'), summary: text('A generated fixture template.', '程式生成的測試模板。'), category: 'intro',
    priceUsdCents: 1200, status: 'approved', version: '1.0.0', rating: 4.8, salesRecent: 24, updated: '2026-01-01T00:00:00.000Z', publishedAt: '2026-01-01T00:00:00.000Z',
    licenseTypes: ['commercial_single_project', 'personal_use'], seller: { name: 'Mock Seller', verified: true },
    specs: { duration: '00:08', resolution: '1920×1080', files: 4, fonts: 0 },
    packageLicense: { parserStatus: 'parsed', file: 'TEMPLATE-LICENSE.txt', detected: 'MIT', excerpt: 'Generated fixture license.' },
    licenseText: 'Generated fixture license. No third-party assets are included.',
    image: image('mock-signal'), imageW: 1200, imageH: 675, alt: text('Generated mock preview'),
    previews: [{ kind: 'image', url: image('mock-signal'), licenseStatus: 'passed', licenseName: 'Generated fixture', licenseSource: 'project', proofRef: null }]
  } as TemplateItem & Record<string, unknown>
];

export const mockEntitlements: LibraryItem[] = [{ id: 'mock-entitlement', templateId: 'mock-template', versionId: 'mock-version', orderId: 'mock-order', licenseType: 'commercial_single_project', maxDownloads: 10, downloadCount: 0, expiresAt: '2030-01-01T00:00:00.000Z', status: 'active', reissuedFromId: null, reissuedToId: null }];
export const mockComplaints: ComplaintItem[] = [];
export const mockSubmissions: SubmissionItem[] = [{ id: 'mock-version', title: text('Signal Intro', '訊號片頭'), seller: 'Mock Seller', submittedAt: '2026-01-01T00:00:00.000Z', parserStatus: 'parsed', scanStatus: 'passed', scanJobId: 'mock-scan', conflictFlag: false, conflictReasons: [], urlAuthorityStatus: 'not_required', pageSummary: null, packageLicense: { file: 'TEMPLATE-LICENSE.txt', excerpt: 'Generated fixture license.' } }];
export const mockAudit = [{ id: 'mock-audit', at: '2026-01-01T00:00:00.000Z', actor: 'Mock Seller', targetId: 'mock-template', diff: [{ field: 'status', before: 'pending_license_review', after: 'approved' }] }];

export const mockData = (): Record<string, unknown> => ({
  today: '2026-01-01T00:00:00.000Z', templates: mockTemplates, entitlements: mockEntitlements, complaints: mockComplaints, submissions: mockSubmissions, audit: mockAudit,
  fx: { usdtPerUsd: 1, quoteTtlMs: 60000 },
  policy: { id: 'refund-policy-v2.1', version: 'v2.1', windowDays: 7, eligible: ['file_corrupted_or_inaccessible', 'materially_not_as_described', 'duplicate_purchase'], exclusions: ['already_downloaded', 'subjective_dissatisfaction'] },
  licenseTypes: { commercial_single_project: { factor: 1, label: text('Single project'), short: text('Single'), desc: text('One commercial project'), scope: {} }, personal_use: { factor: 0.8, label: text('Personal use'), short: text('Personal'), desc: text('Personal use only'), scope: {} }, custom: { factor: 1, label: text('Custom'), short: text('Custom'), desc: text('Custom terms'), scope: {} } }
});

export const mockWorkspace = (): Workspace => ({ entitlements: mockEntitlements, complaints: mockComplaints, submissions: mockSubmissions, audit: mockAudit, scan: { jobId: 'mock-scan', parserStatus: 'parsed', file: 'TEMPLATE-LICENSE.txt', excerpt: 'Generated fixture license.', manifest: [['motion.json', 'json'], ['TEMPLATE-LICENSE.txt', 'text']] } });
export const mockClient: CatalogClient = { async listTemplates() { return { items: mockTemplates, total: mockTemplates.length }; }, async workspace() { return mockWorkspace(); } };
