import type { ImpactEvent } from '@mrtdown/core';
import { describe, expect, test } from 'vitest';
import type { IssueBundleState } from './deriveCurrentState.js';
import { keyForAffectedEntity } from './keyForAffectedEntity.js';
import { reconstructClaimsFromImpactEvents } from './reconstructClaimsFromImpactEvents.js';

const emptyState: IssueBundleState = {
  services: {},
  servicesProvenance: {},
  facilities: {},
  facilitiesProvenance: {},
  impactEventIds: [],
};

describe('reconstructClaimsFromImpactEvents', () => {
  test('preserves every period from periods.set events', () => {
    const entity = { type: 'service' as const, serviceId: 'NSL' };
    const events: ImpactEvent[] = [
      {
        id: 'ie_1',
        type: 'periods.set',
        entity,
        ts: '2026-01-01T10:00:00+08:00',
        basis: { evidenceId: 'ev_1' },
        periods: [
          {
            kind: 'fixed',
            startAt: '2026-01-01T10:00:00+08:00',
            endAt: '2026-01-01T11:00:00+08:00',
          },
          {
            kind: 'fixed',
            startAt: '2026-01-01T12:00:00+08:00',
            endAt: '2026-01-01T13:00:00+08:00',
          },
        ],
      },
    ];

    const claims = reconstructClaimsFromImpactEvents(events, emptyState);

    expect(claims).toHaveLength(2);
    expect(claims.map((claim) => claim.timeHints)).toEqual([
      {
        kind: 'fixed',
        startAt: '2026-01-01T10:00:00+08:00',
        endAt: '2026-01-01T11:00:00+08:00',
      },
      {
        kind: 'fixed',
        startAt: '2026-01-01T12:00:00+08:00',
        endAt: '2026-01-01T13:00:00+08:00',
      },
    ]);
  });

  test('uses end-only only for the period that closes the current open period', () => {
    const entity = { type: 'service' as const, serviceId: 'NSL' };
    const state: IssueBundleState = {
      ...emptyState,
      services: {
        [keyForAffectedEntity(entity)]: {
          serviceId: 'NSL',
          effect: null,
          scopes: [],
          periods: [
            {
              kind: 'fixed',
              startAt: '2026-01-01T10:00:00+08:00',
              endAt: null,
            },
          ],
          causes: [],
        },
      },
    };
    const events: ImpactEvent[] = [
      {
        id: 'ie_1',
        type: 'periods.set',
        entity,
        ts: '2026-01-01T12:00:00+08:00',
        basis: { evidenceId: 'ev_1' },
        periods: [
          {
            kind: 'fixed',
            startAt: '2026-01-01T10:00:00+08:00',
            endAt: '2026-01-01T11:00:00+08:00',
          },
          {
            kind: 'fixed',
            startAt: '2026-01-01T12:00:00+08:00',
            endAt: '2026-01-01T13:00:00+08:00',
          },
        ],
      },
    ];

    const claims = reconstructClaimsFromImpactEvents(events, state);

    expect(claims.map((claim) => claim.timeHints)).toEqual([
      {
        kind: 'end-only',
        endAt: '2026-01-01T11:00:00+08:00',
      },
      {
        kind: 'fixed',
        startAt: '2026-01-01T12:00:00+08:00',
        endAt: '2026-01-01T13:00:00+08:00',
      },
    ]);
  });
});
