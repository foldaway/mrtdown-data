import { describe, expect, it } from 'vitest';
import { ServiceRevisionSchema } from './Service.js';

describe('ServiceRevisionSchema', () => {
  it('requires real civil dates for revision boundaries while allowing an open end', () => {
    const revision = {
      id: 'r1',
      startAt: '2026-01-01',
      endAt: null,
      path: { stations: [] },
      operatingHours: {
        weekdays: { start: '05:30', end: '00:30' },
        weekends: { start: '06:00', end: '00:30' },
      },
    };
    expect(ServiceRevisionSchema.safeParse(revision).success).toBe(true);
    expect(
      ServiceRevisionSchema.safeParse({ ...revision, endAt: '2026-01-03' })
        .success,
    ).toBe(true);
    for (const field of ['startAt', 'endAt']) {
      for (const value of ['2026-01-01T00:00:00+08:00', '2026-02-30']) {
        expect(
          ServiceRevisionSchema.safeParse({ ...revision, [field]: value })
            .success,
        ).toBe(false);
      }
    }
  });
});
