import type {
  Evidence,
  SourceRegistry,
  SourceRegistryRule,
} from '@mrtdown/core';

export type SourceRegistryRuleResolution =
  | {
      ok: true;
      rule: SourceRegistryRule;
      matchingRules: SourceRegistryRule[];
    }
  | {
      ok: false;
      reason: 'invalid-source-url' | 'no-match' | 'ambiguous-match';
      matchingRules: SourceRegistryRule[];
    };

function normalizeHost(host: string): string {
  return host.toLowerCase();
}

function normalizePathPrefix(prefix: string): string {
  return prefix.startsWith('/') ? prefix : `/${prefix}`;
}

function parseEvidenceSourceUrl(evidence: Evidence): URL | null {
  try {
    return new URL(evidence.sourceUrl);
  } catch {
    return null;
  }
}

export function sourceRegistryRuleMatchesEvidence(
  rule: SourceRegistryRule,
  evidence: Evidence,
): boolean {
  const sourceUrl = parseEvidenceSourceUrl(evidence);
  if (!sourceUrl) {
    return false;
  }

  const match = rule.match;
  if (
    match.sourceUrlHost &&
    !match.sourceUrlHost
      .map((host) => normalizeHost(host))
      .includes(normalizeHost(sourceUrl.host))
  ) {
    return false;
  }

  if (
    match.sourceUrlPathPrefix &&
    !match.sourceUrlPathPrefix
      .map((prefix) => normalizePathPrefix(prefix))
      .some((prefix) => sourceUrl.pathname.startsWith(prefix))
  ) {
    return false;
  }

  if (match.evidenceType && !match.evidenceType.includes(evidence.type)) {
    return false;
  }

  return true;
}

export function matchingSourceRegistryRules(
  registry: SourceRegistry,
  evidence: Evidence,
): SourceRegistryRule[] {
  return registry.rules
    .filter((rule) => sourceRegistryRuleMatchesEvidence(rule, evidence))
    .sort((left, right) => {
      const priorityComparison = (right.priority ?? 0) - (left.priority ?? 0);
      return priorityComparison || left.id.localeCompare(right.id);
    });
}

export function resolveSourceRegistryRule(
  registry: SourceRegistry,
  evidence: Evidence,
): SourceRegistryRuleResolution {
  const sourceUrl = parseEvidenceSourceUrl(evidence);
  if (!sourceUrl) {
    return {
      ok: false,
      reason: 'invalid-source-url',
      matchingRules: [],
    };
  }

  const matchingRules = matchingSourceRegistryRules(registry, evidence);
  if (matchingRules.length === 0) {
    return {
      ok: false,
      reason: 'no-match',
      matchingRules,
    };
  }

  const [firstRule, secondRule] = matchingRules;
  if (secondRule && (firstRule.priority ?? 0) === (secondRule.priority ?? 0)) {
    return {
      ok: false,
      reason: 'ambiguous-match',
      matchingRules,
    };
  }

  return {
    ok: true,
    rule: firstRule,
    matchingRules,
  };
}
