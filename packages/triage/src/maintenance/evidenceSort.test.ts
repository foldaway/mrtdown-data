import { describe, expect, it } from 'vitest';
import { compareEvidenceByInstant } from './evidenceSort.js';

describe('compareEvidenceByInstant', () => {
  it('sorts evidence by instant across timestamp offsets', () => {
    const evidence = [
      { id: 'later-local', ts: '2026-05-17T09:00:00+08:00' },
      { id: 'earlier-utc', ts: '2026-05-17T00:30:00Z' },
    ];

    expect(
      [...evidence].sort(compareEvidenceByInstant).map(({ id }) => id),
    ).toEqual(['earlier-utc', 'later-local']);
  });
});
