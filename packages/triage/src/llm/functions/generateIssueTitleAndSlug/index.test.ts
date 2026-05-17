import { describe, expect, it } from 'vitest';
import { ResponseSchema } from './index.js';

describe('generateIssueTitleAndSlug response schema', () => {
  it('accepts slugs that can be embedded in core issue IDs', () => {
    expect(
      ResponseSchema.parse({
        title: 'Signal Fault at Test Station',
        slug: 'signal-fault-at-test-station',
      }).slug,
    ).toBe('signal-fault-at-test-station');
  });

  it('rejects slugs outside the core issue-id charset', () => {
    expect(() =>
      ResponseSchema.parse({
        title: 'Signal Fault',
        slug: 'signal_fault.v2',
      }),
    ).toThrow(
      'Slug must contain lowercase alphanumeric segments separated by single hyphens',
    );
  });
});
