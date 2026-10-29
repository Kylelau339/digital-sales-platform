import type { PackageLicense } from '@shared/contracts/domain.js';
import { CRITICAL_LICENSE_FIELDS, emptySemantic, LICENSE_RULESET_VERSION, LICENSE_RULES, type LicenseSemantic } from './license-rules.js';

export interface LicenseSource { file: string; text: string; scope?: string; }

function statements(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split(/\n|(?<=[.!?;])\s+/).map(line => line.trim().replace(/^(?:[-*+] |\d+[.)] )/, '').replace(/[.!;]$/, '').trim());
}

export function parseLicenseText(file: string, text: string): PackageLicense {
  const semantic = emptySemantic();
  const matchedRuleIds: string[] = [];
  const values = new Map<keyof LicenseSemantic, Set<string>>();
  for (const statement of statements(text)) {
    for (const rule of LICENSE_RULES) if (rule.pattern.test(statement)) {
      if (!matchedRuleIds.includes(rule.id)) matchedRuleIds.push(rule.id);
      const found = values.get(rule.field) ?? new Set<string>();
      found.add(rule.value); values.set(rule.field, found);
      semantic[rule.field] = found.size === 1 ? rule.value : 'unknown';
    }
  }
  const conflict = [...values.values()].some(found => found.size > 1);
  return {
    parserStatus: conflict ? 'failed' : CRITICAL_LICENSE_FIELDS.every(field => semantic[field] !== 'unknown') ? 'parsed' : 'unknown',
    file, detected: null, excerpt: text.replace(/\s+/g, ' ').trim().slice(0, 2000) || null,
    rulesetVersion: LICENSE_RULESET_VERSION, matchedRuleIds, semantic
  };
}

export function mergeLicenseTexts(sources: LicenseSource[]): PackageLicense {
  // Only combine statements describing the same subject. Third-party asset rights
  // can neither grant nor contradict rights in the template itself.
  const groups = new Map<string, LicenseSource[]>();
  for (const source of sources) {
    const scope = source.scope ?? 'package';
    groups.set(scope, [...(groups.get(scope) ?? []), source]);
  }
  const packageSources = groups.get('package') ?? [];
  const result = packageSources.length
    ? parseLicenseText(packageSources.map(source => source.file).join(','), packageSources.map(source => source.text).join('\n'))
    : { ...parseLicenseText('', ''), file: sources[0]?.file ?? null };
  // Contradictions within any one asset's own scope also require human review.
  for (const [scope, scoped] of groups) {
    if (scope !== 'package' && parseLicenseText(scoped.map(source => source.file).join(','), scoped.map(source => source.text).join('\n')).parserStatus === 'failed') result.parserStatus = 'failed';
  }
  return result;
}

export function readmeLicenseSections(text: string): string {
  const selected: string[] = [];
  let inSection = false;
  let fenced = false;
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s{0,3}(?:```|~~~)/.test(line)) { fenced = !fenced; if (inSection) selected.push(line); continue; }
    const heading = !fenced ? /^\s{0,3}(#{1,6})\s*(.*?)\s*#*\s*$/.exec(line) : null;
    if (heading && heading[1]!.length <= 2) inSection = heading[1]!.length === 2 && /^(?:license|licensing)$/i.test(heading[2]!);
    else if (inSection) selected.push(line);
  }
  return selected.join('\n').trim();
}
