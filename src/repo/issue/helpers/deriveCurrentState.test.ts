import { describe, expect, test } from 'vitest';
import type { IssueBundle } from '#schema/issue/bundle.js';
import type { Period } from '#schema/issue/period.js';
import type { ServiceEffect } from '#schema/issue/serviceEffect.js';
import type { ServiceScope } from '#schema/issue/serviceScope.js';
import { keyForAffectedEntity } from '../../../helpers/keyForAffectedEntity.js';
import { deriveCurrentState } from './deriveCurrentState.js';

const defaultTarget = { type: 'service' as const, serviceId: 'NSL' };
const nslKey = keyForAffectedEntity(defaultTarget);

describe('deriveCurrentState', () => {
  const createMockIssue = () => ({
    id: '2025-01-01-test-issue',
    type: 'disruption' as const,
    title: {
      'en-SG': 'Test Issue',
      'zh-Hans': null,
      ms: null,
      ta: null,
    },
    titleMeta: {
      source: 'test',
    },
  });

  const createMockBundle = (
    impact: IssueBundle['impactEvents'],
  ): IssueBundle => ({
    issue: createMockIssue(),
    evidence: [],
    impactEvents: impact,
    path: 'test/path',
  });

  test('returns empty state for bundle with no impacts', () => {
    const bundle = createMockBundle([]);
    const result = deriveCurrentState(bundle);

    expect(result).toEqual({
      services: {},
      servicesProvenance: {},
      facilities: {},
      facilitiesProvenance: {},
      impactEventIds: [],
    });
  });

  test('handles service_effects.set impact', () => {
    const effect: ServiceEffect = { kind: 'delay', duration: null };

    const bundle = createMockBundle([
      {
        id: 'ie_test_001',
        type: 'service_effects.set',
        entity: defaultTarget,
        ts: '2025-01-01T10:00:00Z',
        effect,
        basis: {
          evidenceId: 'evidence-1',
        },
      },
    ]);

    const result = deriveCurrentState(bundle);

    expect(result.services[nslKey]).toMatchObject({
      id: 'NSL',
      effect,
      scopes: [],
      periods: [],
    });
    expect(result.servicesProvenance[nslKey]).toEqual({
      effect: { evidenceId: 'evidence-1' },
    });
    expect(result.impactEventIds).toEqual(['ie_test_001']);
  });

  test('handles periods_set impact', () => {
    const periods: Period[] = [
      {
        kind: 'fixed',
        startAt: '2025-01-01T10:00:00+08:00',
        endAt: '2025-01-01T12:00:00+08:00',
      },
      {
        kind: 'fixed',
        startAt: '2025-01-01T14:00:00+08:00',
        endAt: null,
      },
    ];

    const bundle = createMockBundle([
      {
        id: 'ie_test_001',
        type: 'periods.set',
        entity: defaultTarget,
        ts: '2025-01-01T10:00:00Z',
        periods,
        basis: {
          evidenceId: 'evidence-3',
        },
      },
    ]);

    const result = deriveCurrentState(bundle);

    expect(result.services[nslKey]).toMatchObject({
      id: 'NSL',
      effect: null,
      scopes: [],
      periods,
    });
    expect(result.servicesProvenance[nslKey]).toEqual({
      periods: { evidenceId: 'evidence-3' },
    });
    expect(result.impactEventIds).toEqual(['ie_test_001']);
  });

  test('handles causes.set impact', () => {
    const causes = ['signal.fault', 'track.fault'] as const;

    const bundle = createMockBundle([
      {
        id: 'ie_test_cause_001',
        type: 'causes.set',
        entity: defaultTarget,
        ts: '2025-01-01T10:00:00Z',
        causes: [...causes],
        basis: { evidenceId: 'evidence-cause' },
      },
    ]);

    const result = deriveCurrentState(bundle);

    expect(result.services[nslKey]).toMatchObject({
      id: 'NSL',
      effect: null,
      scopes: [],
      periods: [],
      causes,
    });
    expect(result.servicesProvenance[nslKey]).toEqual({
      causes: { evidenceId: 'evidence-cause' },
    });
    expect(result.impactEventIds).toEqual(['ie_test_cause_001']);
  });

  test('handles service_scopes_set impact', () => {
    const serviceScopes: ServiceScope[] = [
      {
        type: 'service.whole',
      },
      {
        type: 'service.segment',
        fromStationId: 'station-1',
        toStationId: 'station-2',
      },
    ];

    const bundle = createMockBundle([
      {
        id: 'ie_test_001',
        type: 'service_scopes.set',
        entity: defaultTarget,
        ts: '2025-01-01T10:00:00Z',
        serviceScopes,
        basis: {
          evidenceId: 'evidence-5',
        },
      },
    ]);

    const result = deriveCurrentState(bundle);

    expect(result.services[nslKey]).toMatchObject({
      id: 'NSL',
      effect: null,
      scopes: serviceScopes,
      periods: [],
    });
    expect(result.servicesProvenance[nslKey]).toEqual({
      scopes: { evidenceId: 'evidence-5' },
    });
    expect(result.impactEventIds).toEqual(['ie_test_001']);
  });

  test('handles multiple impacts - later impacts overwrite earlier ones', () => {
    const firstEffect: ServiceEffect = { kind: 'delay', duration: null };
    const secondEffect: ServiceEffect = { kind: 'no-service' };

    const bundle = createMockBundle([
      {
        id: 'ie_test_001',
        type: 'service_effects.set',
        entity: defaultTarget,
        ts: '2025-01-01T10:00:00Z',
        effect: firstEffect,
        basis: {
          evidenceId: 'evidence-1',
        },
      },
      {
        id: 'ie_test_002',
        type: 'service_effects.set',
        entity: defaultTarget,
        ts: '2025-01-01T11:00:00Z',
        effect: secondEffect,
        basis: {
          evidenceId: 'evidence-2',
        },
      },
    ]);

    const result = deriveCurrentState(bundle);

    expect(result.services[nslKey].effect).toEqual(secondEffect);
    expect(result.servicesProvenance[nslKey].effect?.evidenceId).toBe(
      'evidence-2',
    );
    expect(result.impactEventIds).toEqual(['ie_test_002']);
  });

  test('handles mixed impact types', () => {
    const effect: ServiceEffect = { kind: 'delay', duration: null };
    const periods: Period[] = [
      {
        kind: 'fixed',
        startAt: '2025-01-01T10:00:00+08:00',
        endAt: '2025-01-01T12:00:00+08:00',
      },
    ];
    const serviceScopes: ServiceScope[] = [
      {
        type: 'service.point',
        stationId: 'station-1',
      },
    ];

    const bundle = createMockBundle([
      {
        id: 'ie_test_001',
        type: 'service_effects.set',
        entity: defaultTarget,
        ts: '2025-01-01T10:00:00Z',
        effect,
        basis: {
          evidenceId: 'evidence-1',
        },
      },
      {
        id: 'ie_test_002',
        type: 'periods.set',
        entity: defaultTarget,
        ts: '2025-01-01T11:00:00Z',
        periods,
        basis: {
          evidenceId: 'evidence-2',
        },
      },
      {
        id: 'ie_test_003',
        type: 'service_scopes.set',
        entity: defaultTarget,
        ts: '2025-01-01T12:00:00Z',
        serviceScopes,
        basis: {
          evidenceId: 'evidence-3',
        },
      },
    ]);

    const result = deriveCurrentState(bundle);

    expect(result.services[nslKey].effect).toEqual(effect);
    expect(result.services[nslKey].periods).toEqual(periods);
    expect(result.services[nslKey].scopes).toEqual(serviceScopes);
    expect(result.servicesProvenance[nslKey].effect?.evidenceId).toBe(
      'evidence-1',
    );
    expect(result.servicesProvenance[nslKey].periods?.evidenceId).toBe(
      'evidence-2',
    );
    expect(result.servicesProvenance[nslKey].scopes?.evidenceId).toBe(
      'evidence-3',
    );
    expect(result.impactEventIds).toEqual([
      'ie_test_001',
      'ie_test_003',
      'ie_test_002',
    ]);
  });

  test('handles all service effect kinds', () => {
    const effectKinds: ServiceEffect['kind'][] = [
      'delay',
      'no-service',
      'reduced-service',
      'service-hours-adjustment',
    ];

    for (const kind of effectKinds) {
      const effect: ServiceEffect =
        kind === 'delay' ? { kind: 'delay', duration: null } : { kind };

      const bundle = createMockBundle([
        {
          id: 'ie_test_001',
          type: 'service_effects.set',
          entity: defaultTarget,
          ts: '2025-01-01T10:00:00Z',
          effect,
          basis: {
            evidenceId: 'evidence-1',
          },
        },
      ]);

      const result = deriveCurrentState(bundle);

      expect(result.services[nslKey].effect).toEqual(effect);
    }
  });

  test('handles all scope types', () => {
    const allScopes: ServiceScope[] = [
      {
        type: 'service.whole',
      },
      {
        type: 'service.segment',
        fromStationId: 'station-1',
        toStationId: 'station-2',
      },
      {
        type: 'service.point',
        stationId: 'station-3',
      },
    ];

    const bundle = createMockBundle([
      {
        id: 'ie_test_001',
        type: 'service_scopes.set',
        entity: defaultTarget,
        ts: '2025-01-01T10:00:00Z',
        serviceScopes: allScopes,
        basis: {
          evidenceId: 'evidence-1',
        },
      },
    ]);

    const result = deriveCurrentState(bundle);

    expect(result.services[nslKey].scopes).toEqual(allScopes);
    expect(result.services[nslKey].scopes).toHaveLength(3);
    expect(result.impactEventIds).toEqual(['ie_test_001']);
  });

  test('handles empty arrays in impacts', () => {
    const bundle = createMockBundle([
      {
        id: 'ie_test_001',
        type: 'service_effects.set',
        entity: defaultTarget,
        ts: '2025-01-01T10:00:00Z',
        effect: { kind: 'no-service' },
        basis: {
          evidenceId: 'evidence-1',
        },
      },
      {
        id: 'ie_test_002',
        type: 'periods.set',
        entity: defaultTarget,
        ts: '2025-01-01T11:00:00Z',
        periods: [],
        basis: {
          evidenceId: 'evidence-2',
        },
      },
      {
        id: 'ie_test_003',
        type: 'service_scopes.set',
        entity: defaultTarget,
        ts: '2025-01-01T12:00:00Z',
        serviceScopes: [],
        basis: {
          evidenceId: 'evidence-3',
        },
      },
    ]);

    const result = deriveCurrentState(bundle);

    expect(result.services[nslKey].effect).toEqual({ kind: 'no-service' });
    expect(result.services[nslKey].periods).toEqual([]);
    expect(result.services[nslKey].scopes).toEqual([]);
    expect(result.impactEventIds).toEqual([
      'ie_test_001',
      'ie_test_003',
      'ie_test_002',
    ]);
  });

  test('preserves order of impacts when processing', () => {
    const firstPeriods: Period[] = [
      {
        kind: 'fixed',
        startAt: '2025-01-01T10:00:00+08:00',
        endAt: '2025-01-01T12:00:00+08:00',
      },
    ];
    const secondPeriods: Period[] = [
      {
        kind: 'fixed',
        startAt: '2025-01-01T14:00:00+08:00',
        endAt: null,
      },
    ];

    const bundle = createMockBundle([
      {
        id: 'ie_test_001',
        type: 'periods.set',
        entity: defaultTarget,
        ts: '2025-01-01T10:00:00Z',
        periods: firstPeriods,
        basis: {
          evidenceId: 'evidence-1',
        },
      },
      {
        id: 'ie_test_002',
        type: 'periods.set',
        entity: defaultTarget,
        ts: '2025-01-01T11:00:00Z',
        periods: secondPeriods,
        basis: {
          evidenceId: 'evidence-2',
        },
      },
    ]);

    const result = deriveCurrentState(bundle);

    expect(result.services[nslKey].periods).toEqual(secondPeriods);
    expect(result.servicesProvenance[nslKey].periods?.evidenceId).toBe(
      'evidence-2',
    );
    expect(result.impactEventIds).toEqual(['ie_test_002']);
  });

  test('groups impacts by target - different targets produce separate entries', () => {
    const nslTarget = { type: 'service' as const, serviceId: 'NSL' };
    const ewlTarget = { type: 'service' as const, serviceId: 'EWL' };
    const nslKeyLocal = keyForAffectedEntity(nslTarget);
    const ewlKey = keyForAffectedEntity(ewlTarget);

    const bundle = createMockBundle([
      {
        id: 'ie_test_001',
        type: 'service_effects.set',
        entity: nslTarget,
        ts: '2025-01-01T10:00:00Z',
        effect: { kind: 'delay', duration: null },
        basis: { evidenceId: 'evidence-1' },
      },
      {
        id: 'ie_test_002',
        type: 'service_effects.set',
        entity: ewlTarget,
        ts: '2025-01-01T10:00:00Z',
        effect: { kind: 'no-service' },
        basis: { evidenceId: 'evidence-2' },
      },
    ]);

    const result = deriveCurrentState(bundle);

    expect(Object.keys(result.services)).toHaveLength(2);
    expect(result.services[nslKeyLocal].effect).toEqual({
      kind: 'delay',
      duration: null,
    });
    expect(result.services[nslKeyLocal]).toMatchObject({ id: 'NSL' });
    expect(result.services[ewlKey].effect).toEqual({ kind: 'no-service' });
    expect(result.services[ewlKey]).toMatchObject({ id: 'EWL' });
    expect(result.impactEventIds).toEqual(['ie_test_002']);
  });

  test('handles facility impacts', () => {
    const facilityEntity = {
      type: 'facility' as const,
      stationId: 'JUR',
      kind: 'lift' as const,
    };
    const facilityKey = keyForAffectedEntity(facilityEntity);

    const bundle = createMockBundle([
      {
        id: 'ie_test_001',
        type: 'facility_effects.set',
        entity: facilityEntity,
        ts: '2025-01-01T10:00:00Z',
        effect: { kind: 'facility-out-of-service' },
        basis: { evidenceId: 'evidence-1' },
      },
      {
        id: 'ie_test_002',
        type: 'periods.set',
        entity: facilityEntity,
        ts: '2025-01-01T10:00:00Z',
        periods: [
          {
            kind: 'fixed',
            startAt: '2025-01-01T10:00:00+08:00',
            endAt: '2025-01-01T12:00:00+08:00',
          },
        ],
        basis: { evidenceId: 'evidence-2' },
      },
    ]);

    const result = deriveCurrentState(bundle);

    expect(result.facilities[facilityKey]).toMatchObject({
      stationId: 'JUR',
      kind: 'lift',
      effect: { kind: 'facility-out-of-service' },
      periods: [
        {
          kind: 'fixed',
          startAt: '2025-01-01T10:00:00+08:00',
          endAt: '2025-01-01T12:00:00+08:00',
        },
      ],
    });
    expect(result.facilitiesProvenance[facilityKey]).toEqual({
      effect: { evidenceId: 'evidence-1' },
      periods: { evidenceId: 'evidence-2' },
    });
    expect(result.impactEventIds).toEqual(['ie_test_002', 'ie_test_001']);
  });
});
