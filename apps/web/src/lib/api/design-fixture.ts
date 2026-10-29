import type { CatalogClient } from './models';
import { mockClient, mockData, mockEntitlements, mockSubmissions, mockAudit } from './mock-fixture';

export function approvedDesignData() { return mockData(); }
export const catalog: CatalogClient = mockClient;
export { mockEntitlements, mockSubmissions, mockAudit };
