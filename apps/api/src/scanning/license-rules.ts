import type { PackageLicense } from '@shared/contracts/domain.js';

export const LICENSE_RULESET_VERSION = 'license-rules-v1.1.0';
export type LicenseSemantic = NonNullable<PackageLicense['semantic']>;
export type SemanticField = keyof LicenseSemantic;
export const CRITICAL_LICENSE_FIELDS = ['commercialUse', 'sourceRedistribution', 'derivativeResale'] as const;
export const emptySemantic = (): LicenseSemantic => ({ commercialUse: 'unknown', sourceRedistribution: 'unknown', derivativeResale: 'unknown', personalUse: 'unknown', attribution: 'unknown' });

interface Rule { id: string; field: SemanticField; value: 'allowed' | 'prohibited'; pattern: RegExp; }
// Every rule consumes an entire statement. Mentions, conditions, examples and negated
// quotations must not grant rights by containing a permissive substring.
export const LICENSE_RULES: readonly Rule[] = [
  { id: 'commercial-use-allowed', field: 'commercialUse', value: 'allowed', pattern: /^commercial use(?:\s+is\s+allowed|\s*:\s*allowed)$/i },
  { id: 'commercial-use-prohibited', field: 'commercialUse', value: 'prohibited', pattern: /^commercial use(?:\s+is\s+(?:not allowed|prohibited)|\s*:\s*(?:not\s*allowed|prohibited))$/i },
  { id: 'source-redistribution-allowed', field: 'sourceRedistribution', value: 'allowed', pattern: /^(?:(?:source|original) (?:code|files?) (?:may|can) be (?:redistributed|resold|sold)|source (?:redistribution(?:\s*\/\s*resale)?|resale)\s*:\s*allowed)$/i },
  { id: 'source-redistribution-prohibited', field: 'sourceRedistribution', value: 'prohibited', pattern: /^(?:(?:source|original) (?:code|files?) (?:(?:may|can) not|must not) be (?:redistributed|resold|sold)|(?:do not|must not|may not) (?:redistribute|resell|sell) (?:the )?(?:source|original) (?:code|files?)|source (?:redistribution(?:\s*\/\s*resale)?|resale)\s*:\s*(?:not\s*allowed|prohibited))$/i },
  { id: 'derivative-resale-allowed', field: 'derivativeResale', value: 'allowed', pattern: /^(?:(?:derivatives?|modified works?|finished derivatives?) (?:may|can) be (?:resold|sold)|resale of finished derivatives is permitted|(?:derivative resale|resale of finished derivatives)\s*:\s*allowed)$/i },
  { id: 'derivative-resale-prohibited', field: 'derivativeResale', value: 'prohibited', pattern: /^(?:(?:derivatives?|modified works?|finished derivatives?) (?:(?:may|can) not|must not) be (?:resold|sold)|(?:do not|must not|may not) (?:resell|sell) (?:derivatives?|modified works?|finished derivatives?)|(?:derivative resale|resale of finished derivatives)\s*:\s*(?:not\s*allowed|prohibited))$/i },
  { id: 'personal-use-allowed', field: 'personalUse', value: 'allowed', pattern: /^personal use(?: is allowed|\s*:\s*allowed)$/i },
  { id: 'personal-use-prohibited', field: 'personalUse', value: 'prohibited', pattern: /^personal use(?: is (?:not allowed|prohibited)|\s*:\s*(?:not\s*allowed|prohibited))$/i },
  { id: 'attribution-required', field: 'attribution', value: 'allowed', pattern: /^attribution(?: is required|\s*:\s*required)$/i },
  { id: 'attribution-not-required', field: 'attribution', value: 'prohibited', pattern: /^attribution(?: is not required|\s*:\s*not required)$/i }
];

// Compatibility for existing callers; parser implementation lives in its own module.
export { parseLicenseText, mergeLicenseTexts } from './license-parser.js';
