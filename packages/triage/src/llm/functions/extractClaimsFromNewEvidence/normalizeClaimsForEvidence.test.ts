import type { Claim } from '@mrtdown/core';
import { describe, expect, test } from 'vitest';
import { normalizeClaimsForEvidence } from './normalizeClaimsForEvidence.js';

describe('normalizeClaimsForEvidence', () => {
  test('downgrades vague future suspension claims when evidence describes current longer waits', () => {
    const evidenceText =
      'East-West Line (EWL) track testing of newly connected sections is causing longer waits of up to 17 minutes for trains from Bedok and Kembangan. A final service suspension to disconnect the EWL from Changi Depot is planned for the first half of 2026, signaling further disruption.';
    const evidenceTs = '2025-12-05T22:12:16+08:00';
    const claims: Claim[] = [
      {
        entity: {
          type: 'service',
          serviceId: 'EWL_MAIN_E',
        },
        effect: {
          service: { kind: 'no-service' },
          facility: null,
        },
        scopes: {
          service: [{ type: 'service.whole' }],
        },
        statusSignal: 'planned',
        timeHints: {
          kind: 'fixed',
          startAt: '2026-01-01T00:00:00+08:00',
          endAt: '2026-07-01T00:00:00+08:00',
        },
        causes: ['system.upgrade'],
      },
    ];

    expect(
      normalizeClaimsForEvidence({
        claims,
        evidenceText,
        evidenceTs,
      }),
    ).toEqual([
      {
        entity: {
          type: 'service',
          serviceId: 'EWL_MAIN_E',
        },
        effect: {
          service: { kind: 'reduced-service' },
          facility: null,
        },
        scopes: {
          service: [{ type: 'service.whole' }],
        },
        statusSignal: 'open',
        timeHints: {
          kind: 'start-only',
          startAt: evidenceTs,
        },
        causes: ['system.upgrade'],
      },
    ]);
  });

  test('does not rewrite explicit no-service closure evidence', () => {
    const evidenceText =
      'Train service is suspended between Jurong East and Clementi from 10pm to end of service for track works.';
    const evidenceTs = '2026-01-01T22:00:00+08:00';
    const claims: Claim[] = [
      {
        entity: {
          type: 'service',
          serviceId: 'EWL_MAIN_E',
        },
        effect: {
          service: { kind: 'no-service' },
          facility: null,
        },
        scopes: {
          service: [
            {
              type: 'service.segment',
              fromStationId: 'JUR',
              toStationId: 'CLE',
            },
          ],
        },
        statusSignal: 'planned',
        timeHints: {
          kind: 'fixed',
          startAt: evidenceTs,
          endAt: '2026-01-02T00:00:00+08:00',
        },
        causes: ['track.work'],
      },
    ];

    expect(
      normalizeClaimsForEvidence({
        claims,
        evidenceText,
        evidenceTs,
      }),
    ).toEqual(claims);
  });
});
