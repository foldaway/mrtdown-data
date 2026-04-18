import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { IssueBundle } from '../schema/issue/bundle.js';
import type { Claim } from '../schema/issue/claim.js';
import type { ImpactEvent } from '../schema/issue/impactEvent.js';
import { IdGenerator } from '../write/id/IdGenerator.js';
import { computeImpactFromEvidenceClaims } from './computeImpactFromEvidenceClaims.js';
import { keyForAffectedEntity } from './keyForAffectedEntity.js';

vi.mock('../write/id/IdGenerator.js', () => ({
  IdGenerator: {
    impactEventId: vi.fn(),
    evidenceId: vi.fn(),
  },
}));

function createMockBundle(impactEvents: ImpactEvent[]): IssueBundle {
  return {
    issue: {
      id: '2025-01-01-test-issue',
      type: 'disruption',
      title: {
        'en-SG': 'Test Issue',
        'zh-Hans': null,
        ms: null,
        ta: null,
      },
      titleMeta: {
        source: 'test',
      },
    },
    evidence: [],
    impactEvents,
    path: 'test/path',
  };
}

function createServiceClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    entity: { type: 'service', serviceId: 'NSL' },
    effect: null,
    scopes: { service: null },
    statusSignal: null,
    timeHints: null,
    causes: null,
    ...overrides,
  };
}

function createFacilityClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    entity: { type: 'facility', stationId: 'NS1', kind: 'lift' },
    effect: null,
    scopes: { service: null },
    statusSignal: null,
    timeHints: null,
    causes: null,
    ...overrides,
  };
}

describe('computeImpactFromEvidenceClaims', () => {
  beforeEach(() => {
    let idCounter = 0;
    vi.mocked(IdGenerator.impactEventId).mockImplementation(() => {
      idCounter += 1;
      return `ie_test_${String(idCounter).padStart(3, '0')}`;
    });
  });

  test('returns empty result when no claims are provided', () => {
    const result = computeImpactFromEvidenceClaims({
      issueBundle: createMockBundle([]),
      evidenceId: '2025-01-01T10:00:00+08:00',
      evidenceTs: '2025-01-01T10:00:00+08:00',
      claims: [],
    });

    expect(result).toEqual({
      newState: {
        services: {},
        servicesProvenance: {},
        facilities: {},
        facilitiesProvenance: {},
        impactEventIds: [],
      },
      newImpactEvents: [],
    });
  });

  test('creates service effect and periods events for fixed time hints', () => {
    const claim = createServiceClaim({
      effect: {
        service: { kind: 'delay', duration: null },
        facility: null,
      },
      statusSignal: 'open',
      timeHints: {
        kind: 'fixed',
        startAt: '2025-01-01T10:00:00+08:00',
        endAt: '2025-01-01T12:00:00+08:00',
      },
    });

    const evidenceId = '2025-01-01T10:05:00+08:00';
    const result = computeImpactFromEvidenceClaims({
      issueBundle: createMockBundle([]),
      evidenceId,
      evidenceTs: evidenceId,
      claims: [claim],
    });

    const serviceKey = keyForAffectedEntity(claim.entity);

    expect(result.newState.services[serviceKey]).toEqual({
      effect: { kind: 'delay', duration: null },
      scopes: [],
      periods: [
        {
          kind: 'fixed',
          startAt: '2025-01-01T10:00:00+08:00',
          endAt: '2025-01-01T12:00:00+08:00',
        },
      ],
      causes: [],
    });
    expect(result.newState.servicesProvenance[serviceKey]).toEqual({
      effect: { evidenceId },
      periods: { evidenceId },
    });
    expect(result.newImpactEvents).toEqual([
      {
        id: 'ie_test_001',
        type: 'service_effects.set',
        ts: evidenceId,
        basis: { evidenceId },
        entity: claim.entity,
        effect: { kind: 'delay', duration: null },
      },
      {
        id: 'ie_test_002',
        type: 'periods.set',
        ts: evidenceId,
        basis: { evidenceId },
        entity: claim.entity,
        periods: [
          {
            kind: 'fixed',
            startAt: '2025-01-01T10:00:00+08:00',
            endAt: '2025-01-01T12:00:00+08:00',
          },
        ],
      },
    ]);
  });

  test('deduplicates claims by affected entity and keeps the last claim', () => {
    const firstClaim = createServiceClaim({
      effect: {
        service: { kind: 'delay', duration: null },
        facility: null,
      },
    });
    const secondClaim = createServiceClaim({
      effect: {
        service: { kind: 'no-service' },
        facility: null,
      },
    });

    const result = computeImpactFromEvidenceClaims({
      issueBundle: createMockBundle([]),
      evidenceId: '2025-01-01T11:00:00+08:00',
      evidenceTs: '2025-01-01T11:00:00+08:00',
      claims: [firstClaim, secondClaim],
    });

    expect(result.newImpactEvents).toHaveLength(1);
    expect(result.newImpactEvents[0]).toMatchObject({
      id: 'ie_test_001',
      type: 'service_effects.set',
      effect: { kind: 'no-service' },
    });
  });

  test('creates service scopes state, provenance, and event', () => {
    const claim = createServiceClaim({
      scopes: {
        service: [
          { type: 'service.whole' },
          {
            type: 'service.segment',
            fromStationId: 'NS1',
            toStationId: 'NS3',
          },
        ],
      },
    });
    const evidenceId = '2025-01-02T09:00:00+08:00';

    const result = computeImpactFromEvidenceClaims({
      issueBundle: createMockBundle([]),
      evidenceId,
      evidenceTs: evidenceId,
      claims: [claim],
    });

    const serviceKey = keyForAffectedEntity(claim.entity);
    expect(result.newState.services[serviceKey]).toEqual({
      effect: null,
      scopes: [
        { type: 'service.whole' },
        {
          type: 'service.segment',
          fromStationId: 'NS1',
          toStationId: 'NS3',
        },
      ],
      periods: [],
      causes: [],
    });
    expect(result.newState.servicesProvenance[serviceKey]).toEqual({
      scopes: { evidenceId },
    });
    expect(result.newImpactEvents).toEqual([
      {
        id: 'ie_test_001',
        type: 'service_scopes.set',
        ts: evidenceId,
        basis: { evidenceId },
        entity: claim.entity,
        serviceScopes: [
          { type: 'service.whole' },
          {
            type: 'service.segment',
            fromStationId: 'NS1',
            toStationId: 'NS3',
          },
        ],
      },
    ]);
  });

  test('emits effects, periods, then scopes when all are present', () => {
    const claim = createServiceClaim({
      effect: {
        service: { kind: 'reduced-service' },
        facility: null,
      },
      timeHints: {
        kind: 'fixed',
        startAt: '2025-01-10T20:00:00+08:00',
        endAt: '2025-01-10T22:00:00+08:00',
      },
      scopes: {
        service: [{ type: 'service.point', stationId: 'NS5' }],
      },
    });
    const evidenceId = '2025-01-10T20:05:00+08:00';

    const result = computeImpactFromEvidenceClaims({
      issueBundle: createMockBundle([]),
      evidenceId,
      evidenceTs: evidenceId,
      claims: [claim],
    });

    expect(result.newImpactEvents.map((event) => event.type)).toEqual([
      'service_effects.set',
      'periods.set',
      'service_scopes.set',
    ]);
  });

  test('emits causes events for service and facility claims', () => {
    const serviceClaim = createServiceClaim({
      causes: ['signal.fault', 'delay'],
    });
    const facilityClaim = createFacilityClaim({
      causes: ['elevator.outage'],
    });
    const evidenceId = '2025-01-10T23:00:00+08:00';

    const result = computeImpactFromEvidenceClaims({
      issueBundle: createMockBundle([]),
      evidenceId,
      evidenceTs: evidenceId,
      claims: [serviceClaim, facilityClaim],
    });

    const serviceKey = keyForAffectedEntity(serviceClaim.entity);
    const facilityKey = keyForAffectedEntity(facilityClaim.entity);

    expect(result.newState.services[serviceKey].causes).toEqual([
      'signal.fault',
      'delay',
    ]);
    expect(result.newState.servicesProvenance[serviceKey]).toEqual({
      causes: { evidenceId },
    });
    expect(result.newState.facilities[facilityKey].causes).toEqual([
      'elevator.outage',
    ]);
    expect(result.newState.facilitiesProvenance[facilityKey]).toEqual({
      causes: { evidenceId },
    });
    expect(result.newImpactEvents.map((event) => event.type)).toEqual([
      'causes.set',
      'causes.set',
    ]);
  });

  test('does not emit events when effect, scopes, and causes are unchanged', () => {
    const serviceEntity = { type: 'service' as const, serviceId: 'NSL' };
    const issueBundle = createMockBundle([
      {
        id: 'ie_seed_effect',
        type: 'service_effects.set',
        entity: serviceEntity,
        ts: '2025-01-01T09:00:00+08:00',
        basis: { evidenceId: 'seed_effect' },
        effect: { kind: 'delay', duration: null },
      },
      {
        id: 'ie_seed_scopes',
        type: 'service_scopes.set',
        entity: serviceEntity,
        ts: '2025-01-01T09:01:00+08:00',
        basis: { evidenceId: 'seed_scopes' },
        serviceScopes: [{ type: 'service.point', stationId: 'NS4' }],
      },
      {
        id: 'ie_seed_causes',
        type: 'causes.set',
        entity: serviceEntity,
        ts: '2025-01-01T09:02:00+08:00',
        basis: { evidenceId: 'seed_causes' },
        causes: ['signal.fault'],
      },
    ]);
    const claim = createServiceClaim({
      entity: serviceEntity,
      effect: {
        service: { kind: 'delay', duration: null },
        facility: null,
      },
      scopes: {
        service: [{ type: 'service.point', stationId: 'NS4' }],
      },
      causes: ['signal.fault'],
    });
    const evidenceId = '2025-01-01T10:00:00+08:00';

    const result = computeImpactFromEvidenceClaims({
      issueBundle,
      evidenceId,
      evidenceTs: evidenceId,
      claims: [claim],
    });

    const serviceKey = keyForAffectedEntity(serviceEntity);
    expect(result.newState.servicesProvenance[serviceKey]).toEqual({
      effect: { evidenceId: 'seed_effect' },
      scopes: { evidenceId: 'seed_scopes' },
      causes: { evidenceId: 'seed_causes' },
    });
    expect(result.newImpactEvents).toEqual([]);
  });

  test('deduplicates scope claims and keeps scopes from last claim', () => {
    const firstClaim = createServiceClaim({
      scopes: {
        service: [{ type: 'service.whole' }],
      },
    });
    const secondClaim = createServiceClaim({
      scopes: {
        service: [{ type: 'service.point', stationId: 'NS9' }],
      },
    });
    const evidenceId = '2025-01-11T08:00:00+08:00';

    const result = computeImpactFromEvidenceClaims({
      issueBundle: createMockBundle([]),
      evidenceId,
      evidenceTs: evidenceId,
      claims: [firstClaim, secondClaim],
    });

    const serviceKey = keyForAffectedEntity(secondClaim.entity);
    expect(result.newState.services[serviceKey].scopes).toEqual([
      { type: 'service.point', stationId: 'NS9' },
    ]);
    expect(result.newState.servicesProvenance[serviceKey]).toEqual({
      scopes: { evidenceId },
    });
    expect(result.newImpactEvents).toEqual([
      {
        id: 'ie_test_001',
        type: 'service_scopes.set',
        ts: evidenceId,
        basis: { evidenceId },
        entity: secondClaim.entity,
        serviceScopes: [{ type: 'service.point', stationId: 'NS9' }],
      },
    ]);
  });

  test('applies start-only hints to recurring periods and updates window start', () => {
    const serviceEntity = { type: 'service' as const, serviceId: 'NSL' };
    const issueBundle = createMockBundle([
      {
        id: 'ie_seed_01',
        type: 'periods.set',
        entity: serviceEntity,
        ts: '2025-01-01T08:00:00+08:00',
        basis: { evidenceId: 'seed' },
        periods: [
          {
            kind: 'recurring',
            frequency: 'daily',
            startAt: '2025-01-01T06:00:00+08:00',
            endAt: '2025-01-07T06:00:00+08:00',
            daysOfWeek: null,
            timeWindow: {
              startAt: '06:00:00',
              endAt: '08:00:00',
            },
            timeZone: 'Asia/Singapore',
            excludedDates: null,
          },
        ],
      },
    ]);

    const claim = createServiceClaim({
      entity: serviceEntity,
      timeHints: {
        kind: 'start-only',
        startAt: '2025-01-02T11:30:00+08:00',
      },
    });
    const evidenceId = '2025-01-02T11:35:00+08:00';

    const result = computeImpactFromEvidenceClaims({
      issueBundle,
      evidenceId,
      evidenceTs: evidenceId,
      claims: [claim],
    });

    const serviceKey = keyForAffectedEntity(serviceEntity);
    expect(result.newState.services[serviceKey].periods).toEqual([
      {
        kind: 'recurring',
        frequency: 'daily',
        startAt: '2025-01-02T11:30:00+08:00',
        endAt: '2025-01-07T06:00:00+08:00',
        daysOfWeek: null,
        timeWindow: {
          startAt: '11:30:00',
          endAt: '08:00:00',
        },
        timeZone: 'Asia/Singapore',
        excludedDates: null,
      },
    ]);
    expect(result.newImpactEvents).toEqual([
      {
        id: 'ie_test_001',
        type: 'periods.set',
        ts: evidenceId,
        basis: { evidenceId },
        entity: serviceEntity,
        periods: result.newState.services[serviceKey].periods,
      },
    ]);
  });

  test('applies end-only hints to facility recurring periods and updates window end', () => {
    const facilityEntity = {
      type: 'facility' as const,
      stationId: 'NS1',
      kind: 'lift' as const,
    };
    const issueBundle = createMockBundle([
      {
        id: 'ie_seed_02',
        type: 'periods.set',
        entity: facilityEntity,
        ts: '2025-01-01T08:00:00+08:00',
        basis: { evidenceId: 'seed' },
        periods: [
          {
            kind: 'recurring',
            frequency: 'weekly',
            startAt: '2025-01-01T06:00:00+08:00',
            endAt: '2025-02-01T06:00:00+08:00',
            daysOfWeek: ['MO', 'WE'],
            timeWindow: {
              startAt: '06:00:00',
              endAt: '09:00:00',
            },
            timeZone: 'Asia/Singapore',
            excludedDates: ['2025-01-15'],
          },
        ],
      },
    ]);

    const claim = createFacilityClaim({
      entity: facilityEntity,
      timeHints: {
        kind: 'end-only',
        endAt: '2025-01-25T23:15:00+08:00',
      },
    });
    const evidenceId = '2025-01-03T12:00:00+08:00';

    const result = computeImpactFromEvidenceClaims({
      issueBundle,
      evidenceId,
      evidenceTs: evidenceId,
      claims: [claim],
    });

    const facilityKey = keyForAffectedEntity(facilityEntity);
    expect(result.newState.facilities[facilityKey].periods).toEqual([
      {
        kind: 'recurring',
        frequency: 'weekly',
        startAt: '2025-01-01T06:00:00+08:00',
        endAt: '2025-01-25T23:15:00+08:00',
        daysOfWeek: ['MO', 'WE'],
        timeWindow: {
          startAt: '06:00:00',
          endAt: '23:15:00',
        },
        timeZone: 'Asia/Singapore',
        excludedDates: ['2025-01-15'],
      },
    ]);
    expect(result.newImpactEvents).toEqual([
      {
        id: 'ie_test_001',
        type: 'periods.set',
        ts: evidenceId,
        basis: { evidenceId },
        entity: facilityEntity,
        periods: result.newState.facilities[facilityKey].periods,
      },
    ]);
  });

  test('start-only with no current periods creates an open fixed period', () => {
    const claim = createServiceClaim({
      timeHints: {
        kind: 'start-only',
        startAt: '2025-01-05T01:00:00+08:00',
      },
    });
    const evidenceId = '2025-01-05T01:05:00+08:00';

    const result = computeImpactFromEvidenceClaims({
      issueBundle: createMockBundle([]),
      evidenceId,
      evidenceTs: evidenceId,
      claims: [claim],
    });

    expect(result.newImpactEvents).toEqual([
      {
        id: 'ie_test_001',
        type: 'periods.set',
        ts: evidenceId,
        basis: { evidenceId },
        entity: claim.entity,
        periods: [
          {
            kind: 'fixed',
            startAt: '2025-01-05T01:00:00+08:00',
            endAt: null,
          },
        ],
      },
    ]);
  });
});
