import { describe, expect, it } from 'vitest';
import {
  AttributionIndexSchema,
  SourceRegistryRuleMatchSchema,
  SourceRegistrySchema,
} from './Rights.js';

function minimalRegistry() {
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
        category: 'platform-post',
        summary: 'Source content is not licensed by MRTDown.',
      },
    ],
    rules: [
      {
        id: 'platform-post',
        label: 'Platform posts',
        match: { sourceUrlHost: ['x.com'] },
        category: 'platform-post',
        contentRights: 'LicenseRef-Third-Party',
        mrtdownRights: 'CC-BY-4.0',
        policy: 'third-party-content-not-licensed-by-mrtdown',
        attributionTemplate: '{sourceUrl}',
        publicExportAllowed: true,
      },
    ],
  };
}

describe('SourceRegistrySchema', () => {
  it('accepts registry rules that reference declared rights ids', () => {
    expect(() => SourceRegistrySchema.parse(minimalRegistry())).not.toThrow();
  });

  it('rejects source registry rules with unknown rights ids', () => {
    const result = SourceRegistrySchema.safeParse({
      ...minimalRegistry(),
      rules: [
        {
          ...minimalRegistry().rules[0],
          contentRights: 'LicenseRef-Missing',
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([
      'rules',
      0,
      'contentRights',
    ]);
  });

  it('requires source rule matches to declare at least one selector', () => {
    const result = SourceRegistryRuleMatchSchema.safeParse({});

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('At least one');
  });
});

describe('AttributionIndexSchema', () => {
  it('accepts generated attribution metadata without embedding evidence text', () => {
    expect(() =>
      AttributionIndexSchema.parse({
        schemaVersion: 1,
        generatedAt: '2026-06-28T00:00:00.000Z',
        dataLicense: 'CC-BY-4.0',
        thirdPartyNotice: 'third-party-source-content-not-licensed-by-mrtdown',
        sourceRules: [
          {
            sourceRuleId: 'platform-post',
            label: 'Platform posts',
            category: 'platform-post',
            contentRights: 'LicenseRef-Third-Party',
            mrtdownRights: 'CC-BY-4.0',
            policy: 'third-party-content-not-licensed-by-mrtdown',
            attributionTemplate: '{sourceUrl}',
            evidenceCount: 1,
          },
        ],
        entries: [
          {
            evidenceId: 'ev_01K00000000000000000000002',
            issueId: '2026-06-29-isl-maintenance',
            sourceUrl: 'https://x.com/example/status/1',
            sourceRuleId: 'platform-post',
            contentRights: 'LicenseRef-Third-Party',
            mrtdownRights: 'CC-BY-4.0',
            policy: 'third-party-content-not-licensed-by-mrtdown',
            attribution: 'https://x.com/example/status/1',
          },
        ],
      }),
    ).not.toThrow();
  });
});
