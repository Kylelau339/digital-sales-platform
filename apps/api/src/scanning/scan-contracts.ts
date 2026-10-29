import type { PackageLicense } from '@shared/contracts/domain.js';
import type { FindingSeverity, ScanFindingCode, ScanStatus } from '@shared/enums/domain.js';

export interface ScanFinding {
  code: ScanFindingCode | string;
  severity: FindingSeverity;
  path: string | null;
  message: string;
  contextSnippet?: string;
}

export interface ScanJobContract {
  id: string;
  versionId: string;
  status: ScanStatus;
  findings: ScanFinding[];
  packageLicense: PackageLicense | null;
  createdAt: string;
  completedAt: string | null;
}

export interface M1ScanResult extends ScanJobContract {
  conflictFlag: boolean;
}

export { M1_SCAN_LIMITS } from './scan-limits.js';
