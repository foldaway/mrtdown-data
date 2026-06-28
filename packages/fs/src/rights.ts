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

function parseArchiveOriginalSourceUrl(sourceUrl: URL | null): URL | null {
  if (sourceUrl?.hostname !== 'web.archive.org') {
    return null;
  }

  const match = /^\/web\/[^/]+\/(.+)$/.exec(sourceUrl.pathname);
  if (!match) {
    return null;
  }

  try {
    return new URL(match[1]);
  } catch {
    try {
      return new URL(decodeURI(match[1]));
    } catch {
      return null;
    }
  }
}

export function sourceRegistryRuleMatchesEvidence(
  rule: SourceRegistryRule,
  evidence: Evidence,
): boolean {
  const sourceUrl = parseEvidenceSourceUrl(evidence);
  const archiveOriginalSourceUrl = parseArchiveOriginalSourceUrl(sourceUrl);

  const match = rule.match;
  if (match.evidenceType && !match.evidenceType.includes(evidence.type)) {
    return false;
  }

  if (
    match.sourceUrlHost &&
    (!sourceUrl ||
      !match.sourceUrlHost
        .map((host) => normalizeHost(host))
        .includes(normalizeHost(sourceUrl.hostname)))
  ) {
    return false;
  }

  if (
    match.sourceUrlOriginalHost &&
    (!archiveOriginalSourceUrl ||
      !match.sourceUrlOriginalHost
        .map((host) => normalizeHost(host))
        .includes(normalizeHost(archiveOriginalSourceUrl.hostname)))
  ) {
    return false;
  }

  if (
    match.sourceUrlPathPrefix &&
    (!sourceUrl ||
      !match.sourceUrlPathPrefix
        .map((prefix) => normalizePathPrefix(prefix))
        .some((prefix) => sourceUrl.pathname.startsWith(prefix)))
  ) {
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
  const matchingRules = matchingSourceRegistryRules(registry, evidence);
  if (matchingRules.length === 0) {
    if (!sourceUrl) {
      return {
        ok: false,
        reason: 'invalid-source-url',
        matchingRules,
      };
    }

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
