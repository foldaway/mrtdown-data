import { globSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Evidence, SourceRegistry } from '@mrtdown/core';
import { EvidenceSchema, SourceRegistrySchema } from '@mrtdown/core';
import { describe, expect, it } from 'vitest';
import {
  matchingSourceRegistryRules,
  resolveSourceRegistryRule,
} from './rights.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function evidence(sourceUrl: string): Evidence {
  return {
    id: 'ev_01K00000000000000000000002',
    ts: '2026-06-23T07:00:00+08:00',
    type: 'statement.official',
    sourceUrl,
    text: 'Example evidence',
    render: null,
  };
}

function registry(rules: SourceRegistry['rules']): SourceRegistry {
  return {
    schemaVersion: 1,
    rights: [
      {
        id: 'CC-BY-4.0',
        label: 'Creative Commons Attribution 4.0 International',
        url: 'https://creativecommons.org/licenses/by/4.0/',
        category: 'mrtdown-authored',
        summary: 'MRTDown-authored reusable data.',
      },
      {
        id: 'LicenseRef-Third-Party',
        label: 'Third-party content',
        url: null,
        category: 'generic-web',
        summary: 'Source content is not licensed by MRTDown.',
      },
    ],
    rules,
  };
}

function rule(
  id: string,
  match: SourceRegistry['rules'][number]['match'],
  priority?: number,
): SourceRegistry['rules'][number] {
  return {
    id,
    label: id,
    match,
    priority,
    category: 'generic-web',
    contentRights: 'LicenseRef-Third-Party',
    mrtdownRights: 'CC-BY-4.0',
    policy: 'third-party-content-not-licensed-by-mrtdown',
    attributionTemplate: '{sourceUrl}',
    publicExportAllowed: true,
  };
}

describe('source registry rule matching', () => {
  it('resolves current evidence rows through the canonical source registry', () => {
    const sourceRegistry = SourceRegistrySchema.parse(
      JSON.parse(
        readFileSync(
          join(repoRoot, 'data/rights/source-registry.json'),
          'utf8',
        ),
      ) as unknown,
    );
    const evidenceFiles = [
      ...globSync('data/issue/*/*/*/evidence.ndjson', { cwd: repoRoot }),
      ...globSync('fixtures/generated/data/issue/*/*/*/evidence.ndjson', {
        cwd: repoRoot,
      }),
    ];
    const unresolved: string[] = [];

    for (const evidenceFile of evidenceFiles) {
      const text = readFileSync(join(repoRoot, evidenceFile), 'utf8');
      for (const [index, line] of text.split('\n').entries()) {
        if (line.trim().length === 0) {
          continue;
        }

        const row = EvidenceSchema.parse(JSON.parse(line) as unknown);
        const result = resolveSourceRegistryRule(sourceRegistry, row);
        if (!result.ok) {
          unresolved.push(
            `${evidenceFile}:${index + 1} ${result.reason} ${row.sourceUrl}`,
          );
        }
      }
    }

    expect(unresolved).toEqual([]);
  });

  it('matches host, path prefix, and evidence type selectors', () => {
    const sourceRegistry = registry([
      rule('x-status', {
        sourceUrlHost: ['x.com'],
        sourceUrlPathPrefix: ['/SMRT_Singapore/status/'],
        evidenceType: ['statement.official'],
      }),
      rule('reddit', { sourceUrlHost: ['www.reddit.com'] }),
    ]);

    expect(
      matchingSourceRegistryRules(
        sourceRegistry,
        evidence('https://x.com/SMRT_Singapore/status/2056196363076108391'),
      ).map((matchedRule) => matchedRule.id),
    ).toEqual(['x-status']);
  });

  it('matches source hosts without treating URL ports as part of the host', () => {
    expect(
      matchingSourceRegistryRules(
        registry([rule('x', { sourceUrlHost: ['x.com'] })]),
        evidence(
          'https://x.com:8443/SMRT_Singapore/status/2056196363076108391',
        ),
      ).map((matchedRule) => matchedRule.id),
    ).toEqual(['x']);
  });

  it('can match evidence-type-only rules without a valid source URL', () => {
    const typedEvidence = {
      ...evidence('not a url'),
      type: 'report.public',
    } satisfies Evidence;

    expect(
      resolveSourceRegistryRule(
        registry([rule('public-report', { evidenceType: ['report.public'] })]),
        typedEvidence,
      ),
    ).toMatchObject({
      ok: true,
      rule: { id: 'public-report' },
    });
  });

  it('matches archived publisher URLs by original host before archive fallback', () => {
    const sourceRegistry = registry([
      rule('web-archive-snapshot', {
        sourceUrlHost: ['web.archive.org'],
        sourceUrlPathPrefix: ['/web/'],
      }),
      rule(
        'web-archive-cna-article',
        {
          sourceUrlHost: ['web.archive.org'],
          sourceUrlOriginalHost: ['www.channelnewsasia.com'],
        },
        20,
      ),
    ]);

    expect(
      resolveSourceRegistryRule(
        sourceRegistry,
        evidence(
          'https://web.archive.org/web/20240408192544/https://www.channelnewsasia.com/singapore/example-3823096',
        ),
      ),
    ).toMatchObject({
      ok: true,
      rule: { id: 'web-archive-cna-article' },
      matchingRules: [
        { id: 'web-archive-cna-article' },
        { id: 'web-archive-snapshot' },
      ],
    });
  });

  it('resolves to the highest-priority matching rule', () => {
    const result = resolveSourceRegistryRule(
      registry([
        rule('generic-x', { sourceUrlHost: ['x.com'] }),
        rule(
          'smrt-x',
          {
            sourceUrlHost: ['x.com'],
            sourceUrlPathPrefix: ['/SMRT_Singapore/status/'],
          },
          10,
        ),
      ]),
      evidence('https://x.com/SMRT_Singapore/status/2056196363076108391'),
    );

    expect(result).toMatchObject({
      ok: true,
      rule: { id: 'smrt-x' },
      matchingRules: [{ id: 'smrt-x' }, { id: 'generic-x' }],
    });
  });

  it('reports same-priority matches as ambiguous in deterministic order', () => {
    const result = resolveSourceRegistryRule(
      registry([
        rule('x-b', { sourceUrlHost: ['x.com'] }),
        rule('x-a', { sourceUrlHost: ['x.com'] }),
      ]),
      evidence('https://x.com/SMRT_Singapore/status/2056196363076108391'),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: 'ambiguous-match',
      matchingRules: [{ id: 'x-a' }, { id: 'x-b' }],
    });
  });

  it('reports unmatched and invalid source URLs separately', () => {
    expect(
      resolveSourceRegistryRule(
        registry([rule('x', { sourceUrlHost: ['x.com'] })]),
        evidence('https://example.com/news/1'),
      ),
    ).toMatchObject({ ok: false, reason: 'no-match' });

    expect(
      resolveSourceRegistryRule(
        registry([rule('x', { sourceUrlHost: ['x.com'] })]),
        evidence('not a url'),
      ),
    ).toMatchObject({ ok: false, reason: 'invalid-source-url' });
  });
});
