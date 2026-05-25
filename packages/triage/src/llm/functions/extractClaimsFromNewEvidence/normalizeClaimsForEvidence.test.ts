import type { Claim } from '@mrtdown/core';
import type { MRTDownRepository } from '@mrtdown/fs';
import { describe, expect, test } from 'vitest';
import { normalizeClaimsForEvidence } from './normalizeClaimsForEvidence.js';

describe('normalizeClaimsForEvidence', () => {
  test('adds start-only time hint when service-impact claim is missing time hints', () => {
    const evidenceTs = '2026-03-01T08:10:00+08:00';
    const claims: Claim[] = [
      {
        entity: { type: 'service', serviceId: 'NSL_MAIN_S' },
        effect: { service: { kind: 'delay', duration: null }, facility: null },
        scopes: { service: [{ type: 'service.whole' }] },
        statusSignal: 'open',
        timeHints: null,
        causes: ['track.fault'],
      },
    ];

    expect(
      normalizeClaimsForEvidence({
        claims,
        evidenceTs,
      }),
    ).toEqual([
      {
        ...claims[0],
        timeHints: {
          kind: 'start-only',
          startAt: evidenceTs,
        },
      },
    ]);
  });

  test('normalizes nullable claim fields', () => {
    const evidenceTs = '2026-01-01T08:10:00+08:00';
    const claims: Claim[] = [
      {
        entity: { type: 'service', serviceId: 'BTL_MAIN_E' },
        effect: null,
        scopes: { service: [{ type: 'service.whole' }] },
        statusSignal: 'cleared',
        timeHints: { kind: 'end-only', endAt: evidenceTs },
        causes: [],
      } as unknown as Claim,
    ];

    expect(
      normalizeClaimsForEvidence({
        claims,
        evidenceTs,
      }),
    ).toEqual([
      {
        ...claims[0],
        effect: { service: null, facility: null },
        causes: null,
      },
    ]);
  });

  test('deduplicates whole-line degraded-service claims and fills active sibling services', () => {
    const evidenceTs = '2026-01-05T22:12:16+08:00';
    const baseClaim = {
      effect: { service: { kind: 'reduced-service' } },
      scopes: { service: [{ type: 'service.whole' }] },
      statusSignal: 'open',
      timeHints: { kind: 'start-only', startAt: evidenceTs },
      causes: ['system.upgrade'],
    };
    const claims = [
      {
        ...baseClaim,
        entity: { type: 'service', serviceId: 'BTL_MAIN_E' },
      },
      {
        ...baseClaim,
        entity: { type: 'service', serviceId: 'BTL_MAIN_E' },
        effect: { service: { kind: 'reduced-service' }, facility: null },
      },
      {
        ...baseClaim,
        entity: { type: 'service', serviceId: 'BTL_MAIN_W' },
      },
      {
        ...baseClaim,
        entity: { type: 'service', serviceId: 'ERL_MAIN_CW' },
      },
      {
        ...baseClaim,
        entity: { type: 'service', serviceId: 'ERL_MAIN_CCW' },
        effect: { service: { kind: 'reduced-service' }, facility: null },
      },
    ] as unknown as Claim[];

    const repo = buildServiceRepo({
      BTL_MAIN_E: 'BTL',
      BTL_MAIN_W: 'BTL',
      ERL_MAIN_CW: 'ERL',
      ERL_MAIN_CCW: 'ERL',
      ERL_EAST_COAST_C: 'ERL',
    });

    expect(
      normalizeClaimsForEvidence({
        claims,
        evidenceTs,
        repo,
      }),
    ).toEqual(
      [
        'BTL_MAIN_E',
        'BTL_MAIN_W',
        'ERL_MAIN_CW',
        'ERL_MAIN_CCW',
        'ERL_EAST_COAST_C',
      ].map((serviceId) => ({
        ...baseClaim,
        entity: { type: 'service', serviceId },
        effect: { service: { kind: 'reduced-service' }, facility: null },
      })),
    );
  });

  test('deduplicates semantically identical claims with different key order', () => {
    const evidenceTs = '2026-01-01T07:10:00+08:00';
    const claim: Claim = {
      entity: { type: 'service', serviceId: 'BTL_MAIN_E' },
      effect: { service: { kind: 'delay', duration: null }, facility: null },
      scopes: { service: [{ type: 'service.whole' }] },
      statusSignal: 'open',
      timeHints: { kind: 'start-only', startAt: evidenceTs },
      causes: null,
    };
    const sameClaimWithDifferentKeyOrder = {
      causes: null,
      timeHints: { startAt: evidenceTs, kind: 'start-only' },
      statusSignal: 'open',
      scopes: { service: [{ type: 'service.whole' }] },
      effect: { facility: null, service: { duration: null, kind: 'delay' } },
      entity: { serviceId: 'BTL_MAIN_E', type: 'service' },
    } as unknown as Claim;

    expect(
      normalizeClaimsForEvidence({
        claims: [claim, sameClaimWithDifferentKeyOrder],
        evidenceTs,
      }),
    ).toEqual([claim]);
  });

  test('does not fill sibling services for single-service whole claims', () => {
    const evidenceTs = '2026-01-01T07:10:00+08:00';
    const claim: Claim = {
      entity: { type: 'service', serviceId: 'BTL_MAIN_E' },
      effect: { service: { kind: 'delay', duration: null }, facility: null },
      scopes: { service: [{ type: 'service.whole' }] },
      statusSignal: 'open',
      timeHints: { kind: 'start-only', startAt: evidenceTs },
      causes: null,
    };

    expect(
      normalizeClaimsForEvidence({
        claims: [claim],
        evidenceTs,
        repo: buildServiceRepo({
          BTL_MAIN_E: 'BTL',
          BTL_MAIN_W: 'BTL',
        }),
      }),
    ).toEqual([claim]);
  });

  test('does not fill sibling services from duplicate single-service claims', () => {
    const evidenceTs = '2026-01-01T07:10:00+08:00';
    const claim: Claim = {
      entity: { type: 'service', serviceId: 'BTL_MAIN_E' },
      effect: { service: { kind: 'delay', duration: null }, facility: null },
      scopes: { service: [{ type: 'service.whole' }] },
      statusSignal: 'open',
      timeHints: { kind: 'start-only', startAt: evidenceTs },
      causes: null,
    };

    expect(
      normalizeClaimsForEvidence({
        claims: [claim, claim],
        evidenceTs,
        repo: buildServiceRepo({
          BTL_MAIN_E: 'BTL',
          BTL_MAIN_W: 'BTL',
        }),
      }),
    ).toEqual([claim]);
  });

  test('does not fill sibling services from inactive service claims', () => {
    const evidenceTs = '2026-01-01T07:10:00+08:00';
    const baseClaim = {
      effect: { service: { kind: 'delay', duration: null }, facility: null },
      scopes: { service: [{ type: 'service.whole' }] },
      statusSignal: 'open',
      timeHints: { kind: 'start-only', startAt: evidenceTs },
      causes: null,
    };
    const claims = [
      {
        ...baseClaim,
        entity: { type: 'service', serviceId: 'BTL_MAIN_E' },
      },
      {
        ...baseClaim,
        entity: { type: 'service', serviceId: 'BTL_OLD_E' },
      },
    ] as unknown as Claim[];

    expect(
      normalizeClaimsForEvidence({
        claims,
        evidenceTs,
        repo: buildServiceRepo({
          BTL_MAIN_E: 'BTL',
          BTL_MAIN_W: 'BTL',
          BTL_OLD_E: {
            lineId: 'BTL',
            startAt: '2025-01-01',
            endAt: '2025-12-31',
          },
        }),
      }),
    ).toEqual(claims);
  });
});

type ServiceFixture =
  | string
  | {
      lineId: string;
      startAt: string;
      endAt: string | null;
    };

function buildServiceRepo(
  serviceFixtureById: Record<string, ServiceFixture>,
): MRTDownRepository {
  return {
    services: {
      get(serviceId: string) {
        const fixture = serviceFixtureById[serviceId];
        if (fixture == null) {
          return null;
        }
        const revision =
          typeof fixture === 'string'
            ? { lineId: fixture, startAt: '2025-12-31', endAt: null }
            : fixture;

        return revision.lineId == null
          ? null
          : {
              id: serviceId,
              lineId: revision.lineId,
              name: { 'en-SG': serviceId },
              revisions: [{ startAt: revision.startAt, endAt: revision.endAt }],
            };
      },
      searchByLineId(lineId: string) {
        return Object.keys(serviceFixtureById)
          .map((serviceId) => this.get(serviceId))
          .filter(
            (service): service is NonNullable<typeof service> =>
              service != null && service.lineId === lineId,
          );
      },
    },
  } as unknown as MRTDownRepository;
}
