/* Generated local-only fixture client. No external or bundled demo assets are used. */
import { mockClient, mockEntitlements, mockSubmissions } from './mock-fixture';

export function adaptEntitlements() { return mockEntitlements.map(item => ({ ...item })); }
export const fixtureClient = mockClient;
export const scanFixture = { jobId: 'mock-scan', parserStatus: 'parsed', file: 'TEMPLATE-LICENSE.txt', excerpt: 'Generated fixture license.', manifest: [['motion.json', 'json'], ['TEMPLATE-LICENSE.txt', 'text']] };
export { mockSubmissions };
