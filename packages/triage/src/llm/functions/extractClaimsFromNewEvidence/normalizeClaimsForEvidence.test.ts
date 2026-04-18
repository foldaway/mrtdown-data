import type { Claim } from '@mrtdown/core';
import type { MRTDownRepository } from '@mrtdown/fs';
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

  test('drops branch services when evidence station mentions only match the main branch', () => {
    const evidenceText =
      '[EWL] UPDATE: Passengers travelling towards the city centre, use NSL at Jurong East, Woodlands, Bishan and TEL at Caldecott.';
    const evidenceTs = '2024-09-25T16:11:05+08:00';
    const claims: Claim[] = [
      {
        entity: { type: 'service', serviceId: 'EWL_MAIN_E' },
        effect: { service: { kind: 'reduced-service' }, facility: null },
        scopes: { service: [{ type: 'service.whole' }] },
        statusSignal: 'open',
        timeHints: { kind: 'start-only', startAt: evidenceTs },
        causes: ['power.fault'],
      },
      {
        entity: { type: 'service', serviceId: 'EWL_MAIN_W' },
        effect: { service: { kind: 'reduced-service' }, facility: null },
        scopes: { service: [{ type: 'service.whole' }] },
        statusSignal: 'open',
        timeHints: { kind: 'start-only', startAt: evidenceTs },
        causes: ['power.fault'],
      },
      {
        entity: { type: 'service', serviceId: 'EWL_CG_E' },
        effect: { service: { kind: 'reduced-service' }, facility: null },
        scopes: { service: [{ type: 'service.whole' }] },
        statusSignal: 'open',
        timeHints: { kind: 'start-only', startAt: evidenceTs },
        causes: ['power.fault'],
      },
      {
        entity: { type: 'service', serviceId: 'EWL_CG_W' },
        effect: { service: { kind: 'reduced-service' }, facility: null },
        scopes: { service: [{ type: 'service.whole' }] },
        statusSignal: 'open',
        timeHints: { kind: 'start-only', startAt: evidenceTs },
        causes: ['power.fault'],
      },
    ];

    const repo = {
      services: {
        get(serviceId: string) {
          const stationsByServiceId: Record<string, string[]> = {
            EWL_MAIN_E: ['BNL', 'JUR', 'WDL', 'BSH', 'QUE'],
            EWL_MAIN_W: ['QUE', 'BSH', 'WDL', 'JUR', 'BNL'],
            EWL_CG_E: ['TNM', 'XPO', 'CGA'],
            EWL_CG_W: ['CGA', 'XPO', 'TNM'],
          };
          const stationIds = stationsByServiceId[serviceId];
          return stationIds == null
            ? null
            : {
                id: serviceId,
                lineId: 'EWL',
                name: { 'en-SG': serviceId },
                revisions: [
                  {
                    id: 'r1',
                    startAt: '2010-01-01',
                    endAt: null,
                    path: {
                      stations: stationIds.map((stationId) => ({
                        stationId,
                        displayCode: stationId,
                      })),
                    },
                    operatingHours: {
                      weekdays: { start: '05:00', end: '00:00' },
                      weekends: { start: '05:00', end: '00:00' },
                    },
                  },
                ],
              };
        },
      },
      stations: {
        list() {
          return [
            {
              id: 'JUR',
              name: { 'en-SG': 'Jurong East' },
              stationCodes: [],
            },
            {
              id: 'WDL',
              name: { 'en-SG': 'Woodlands' },
              stationCodes: [],
            },
            {
              id: 'BSH',
              name: { 'en-SG': 'Bishan' },
              stationCodes: [],
            },
            {
              id: 'CDT',
              name: { 'en-SG': 'Caldecott' },
              stationCodes: [],
            },
          ];
        },
      },
    } as unknown as MRTDownRepository;

    expect(
      normalizeClaimsForEvidence({
        claims,
        evidenceText,
        evidenceTs,
        repo,
      }),
    ).toEqual(claims.slice(0, 2));
  });

  test('synthesizes planned whole-line closure claims from context-resolved evidence', () => {
    const evidenceText =
      'Bukit Panjang LRT line will be closed on Aug 31 and Sep 21 for the works, and shuttle buses will be provided at the usual fares.';
    const evidenceTs = '2025-07-30T19:03:02+08:00';

    const repo = {
      lines: {
        list() {
          return [
            {
              id: 'BPLRT',
              name: { 'en-SG': 'Bukit Panjang LRT' },
            },
          ];
        },
      },
      services: {
        searchByLineId(lineId: string) {
          if (lineId !== 'BPLRT') {
            return [];
          }

          return [
            {
              id: 'BPLRT_A',
              lineId: 'BPLRT',
              name: { 'en-SG': 'Bukit Panjang LRT - Service A' },
              revisions: [{ startAt: '1999-11-06', endAt: null }],
            },
            {
              id: 'BPLRT_B',
              lineId: 'BPLRT',
              name: { 'en-SG': 'Bukit Panjang LRT - Service B' },
              revisions: [{ startAt: '1999-11-06', endAt: null }],
            },
            {
              id: 'BPLRT_C',
              lineId: 'BPLRT',
              name: { 'en-SG': 'Bukit Panjang LRT - Service C' },
              revisions: [{ startAt: '1999-11-06', endAt: '2019-01-13' }],
            },
          ];
        },
      },
      stations: {
        list() {
          return [];
        },
      },
    } as unknown as MRTDownRepository;

    expect(
      normalizeClaimsForEvidence({
        claims: [],
        evidenceText,
        evidenceTs,
        repo,
      }),
    ).toEqual([
      {
        entity: { type: 'service', serviceId: 'BPLRT_A' },
        effect: { service: { kind: 'no-service' }, facility: null },
        scopes: { service: [{ type: 'service.whole' }] },
        statusSignal: 'planned',
        timeHints: {
          kind: 'fixed',
          startAt: '2025-08-31T00:00:00+08:00',
          endAt: '2025-09-01T00:00:00+08:00',
        },
        causes: ['system.upgrade'],
      },
      {
        entity: { type: 'service', serviceId: 'BPLRT_A' },
        effect: { service: { kind: 'no-service' }, facility: null },
        scopes: { service: [{ type: 'service.whole' }] },
        statusSignal: 'planned',
        timeHints: {
          kind: 'fixed',
          startAt: '2025-09-21T00:00:00+08:00',
          endAt: '2025-09-22T00:00:00+08:00',
        },
        causes: ['system.upgrade'],
      },
      {
        entity: { type: 'service', serviceId: 'BPLRT_B' },
        effect: { service: { kind: 'no-service' }, facility: null },
        scopes: { service: [{ type: 'service.whole' }] },
        statusSignal: 'planned',
        timeHints: {
          kind: 'fixed',
          startAt: '2025-08-31T00:00:00+08:00',
          endAt: '2025-09-01T00:00:00+08:00',
        },
        causes: ['system.upgrade'],
      },
      {
        entity: { type: 'service', serviceId: 'BPLRT_B' },
        effect: { service: { kind: 'no-service' }, facility: null },
        scopes: { service: [{ type: 'service.whole' }] },
        statusSignal: 'planned',
        timeHints: {
          kind: 'fixed',
          startAt: '2025-09-21T00:00:00+08:00',
          endAt: '2025-09-22T00:00:00+08:00',
        },
        causes: ['system.upgrade'],
      },
    ]);
  });
});
