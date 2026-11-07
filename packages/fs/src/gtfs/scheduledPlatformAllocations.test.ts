import { describe, expect, it } from 'vitest';
import { holidayFixture } from './__tests__/holidayFixture.js';
import { hashBytes } from './capture.js';
import { groupedScopedReviewDraftSha256 } from './groupedReviewContract.js';
import { evaluateScheduledHolidayMapping } from './scheduledHolidayMapping.js';
import { createScheduledHolidayReviewDraft } from './scheduledHolidayReview.js';
import {
  applyScheduledPlatformAllocationServiceMemberships,
  createScheduledPlatformAllocationMappingDraft,
  evaluateScheduledPlatformAllocationMapping,
  scheduledPlatformAllocationMappingDraftSha256,
} from './scheduledPlatformAllocations.js';

function fixture() {
  const { context, policy: holidayPolicy, calendar } = holidayFixture();
  context.tables['routes.txt'] = context.tables['routes.txt'].filter(
    (row) => row.route_id === 'NEL_TEST',
  );
  context.tables['trips.txt'] = context.tables['trips.txt'].filter(
    (row) => row.route_id === 'NEL_TEST',
  );
  context.tables['stop_times.txt'] = context.tables['stop_times.txt'].filter(
    (row) => row.trip_id.startsWith('NEL_TEST_'),
  );
  context.topology.services.push({
    id: 'REVERSE',
    lineId: 'NEL',
    revisions: [
      {
        id: 'RR',
        startAt: '2000-01-01',
        endAt: null,
        stations: [
          { stationId: 'D', displayCode: 'NE3' },
          { stationId: 'S', displayCode: 'NE1' },
        ],
      },
    ],
  });
  context.topology.lines[0].serviceIds.push('REVERSE');
  for (const station of context.topology.stations) {
    station.platforms.push({
      ...station.platforms[0],
      id: `reverse-${station.id}`,
      label: station.id === 'S' ? 'B' : 'A',
      serviceIds: ['REVERSE'],
    });
  }
  for (const row of context.tables['stops.txt']) {
    if (row.stop_id === 'P' || row.stop_id === 'Q') {
      row.platform_code = row.stop_id === 'P' ? 'B' : 'A';
    }
  }
  context.tables['trips.txt'].push({
    route_id: 'NEL_TEST',
    service_id: 'WD',
    trip_id: 'FIRST',
    direction_id: '1',
  });
  context.tables['stop_times.txt'].push(
    ...['Q', 'P'].map((stop_id, index) => ({
      trip_id: 'FIRST',
      stop_id,
      stop_sequence: String(index + 1),
      arrival_time: '05:00:00',
      departure_time: '05:00:00',
    })),
  );
  context.identity.topology.sha256 = hashBytes(
    Buffer.from(JSON.stringify(context.topology)),
  );
  const policy = {
    schemaVersion: 1,
    revision: 'synthetic-source-precedence-v1',
    sourceManifest: context.identity.sourceManifest,
    allocations: [
      {
        providerStopId: 'P',
        stationId: 'S',
        lineId: 'NEL',
        platformCode: 'B',
        serviceIds: ['SVC'],
        reason:
          'Synthetic source allocation differs from the canonical default',
      },
      {
        providerStopId: 'Q',
        stationId: 'D',
        lineId: 'NEL',
        platformCode: 'A',
        serviceIds: ['SVC'],
        reason:
          'Synthetic source allocation differs from the canonical default',
      },
    ],
  };
  return { context, policy, holidayPolicy, calendar };
}
function prepare(source = fixture()) {
  return {
    ...source,
    draft: createScheduledPlatformAllocationMappingDraft(
      source.context,
      source.policy,
      source.holidayPolicy,
      source.calendar,
    ),
  };
}
type Prepared = ReturnType<typeof prepare>;
function approval(draft: Prepared['draft']) {
  return {
    schemaVersion: 1,
    documentKind: 'gtfs-platform-allocation-mapping-approval',
    identity: draft.identity,
    draftSha256: scheduledPlatformAllocationMappingDraftSha256(draft),
    reviewer: 'Synthetic reviewer',
    reason: 'Synthetic approval of source precedence and mappings',
  };
}
function evaluate(input: Prepared, review?: unknown) {
  return evaluateScheduledPlatformAllocationMapping(
    input.context,
    input.policy,
    input.holidayPolicy,
    input.calendar,
    input.draft,
    review,
  );
}

describe('source platform allocation review', () => {
  it('applies shared memberships while retaining source dates for patterns outside the holiday policy', () => {
    const source = fixture();
    const outside = holidayFixture().context.tables;
    source.context.tables['routes.txt'].push(
      ...outside['routes.txt'].filter((row) => row.route_id === 'NSL_TEST'),
    );
    source.context.tables['trips.txt'].push(
      ...outside['trips.txt'].filter((row) => row.route_id === 'NSL_TEST'),
    );
    source.context.tables['stop_times.txt'].push(
      ...outside['stop_times.txt'].filter((row) =>
        row.trip_id.startsWith('NSL_TEST_'),
      ),
    );
    const shared = structuredClone(source.context.topology.services[0]);
    shared.id = 'SHARED';
    shared.revisions[0].id = 'SHARED_R';
    source.context.topology.services.push(shared);
    source.context.topology.lines[0].serviceIds.push(shared.id);
    for (const allocation of source.policy.allocations)
      allocation.serviceIds.push(shared.id);
    source.context.identity.topology.sha256 = hashBytes(
      Buffer.from(JSON.stringify(source.context.topology)),
    );
    const { draft } = prepare(source);
    const pattern = draft.dateReview.patterns.find((pattern) =>
      pattern.tripIds.includes('NEL_TEST_SU'),
    );
    if (!pattern) throw new Error('Missing synthetic Sunday pattern');
    const before = structuredClone({ source, draft });
    const updated = applyScheduledPlatformAllocationServiceMemberships(
      source.context,
      source.policy,
      source.holidayPolicy,
      source.calendar,
      draft,
      {
        schemaVersion: 1,
        documentKind: 'gtfs-shared-service-membership-claims',
        baseDraftSha256: groupedScopedReviewDraftSha256(draft.mapping.mapping),
        claims: [
          {
            providerPatternId: pattern.providerPatternId,
            serviceDates: ['2026-11-09'],
            reason:
              'Synthetic both-services claim on an added public-holiday date',
            target: {
              kind: 'sharedServiceRevisions',
              members: [
                {
                  kind: 'serviceRevision',
                  id: 'SVC',
                  revisionId: 'R',
                  match: 'exact',
                },
                {
                  kind: 'serviceRevision',
                  id: 'SHARED',
                  revisionId: 'SHARED_R',
                  match: 'exact',
                },
              ],
            },
          },
        ],
      },
    );
    expect(
      evaluateScheduledPlatformAllocationMapping(
        source.context,
        source.policy,
        source.holidayPolicy,
        source.calendar,
        updated,
      ),
    ).toMatchObject({
      valid: true,
      coverageComplete: true,
      excludedPatternDates: 0,
      approvalMatches: false,
      mappingReviewEligible: false,
      generationEligible: false,
    });
    expect(updated.dateReview).toEqual(draft.dateReview);
    const unchanged = (mapping: typeof draft.mapping.mapping) =>
      mapping.decisions.filter(
        (decision) =>
          decision.kind !== 'pattern' ||
          decision.providerId !== pattern.providerPatternId,
      );
    expect(unchanged(updated.mapping.mapping)).toEqual(
      unchanged(draft.mapping.mapping),
    );
    expect(
      updated.mapping.mapping.decisions.filter(
        (decision) =>
          decision.kind === 'pattern' &&
          decision.providerId !== pattern.providerPatternId,
      ),
    ).toHaveLength(6);
    const selected = updated.mapping.mapping.decisions.find(
      (decision) =>
        decision.kind === 'pattern' &&
        decision.target?.kind === 'sharedServiceRevisions',
    );
    if (selected?.kind !== 'pattern')
      throw new Error('Missing shared membership decision');
    expect(
      updated.mapping.mapping.dateSets.find(
        (set) => set.id === selected.dateSetId,
      )?.serviceDates,
    ).toEqual(['2026-11-09']);
    expect({ source, draft }).toEqual(before);
  });

  it('honors source labels for ordinary and first-morning variants while retaining canonical defaults and original evidence', () => {
    const source = fixture();
    const original = structuredClone(source);
    const before = createScheduledHolidayReviewDraft(
      source.context,
      source.holidayPolicy,
      source.calendar,
    );
    expect(
      before.patterns.find((pattern) => pattern.tripIds.includes('FIRST'))
        ?.reviewCells[0].disposition,
    ).toBe('proposed');
    expect(
      before.patterns.find((pattern) => pattern.tripIds.includes('NEL_TEST_WD'))
        ?.reviewCells[0].disposition,
    ).toBe('unresolved');
    const input = prepare(source);
    expect(source).toEqual(original);
    expect(input.draft.identity.source).toEqual(source.context.identity);
    expect(input.draft.identity.reviewTopologySha256).not.toBe(
      source.context.identity.topology.sha256,
    );
    expect(input.draft.mapping.identity.source.sourceManifest).toEqual(
      source.context.identity.sourceManifest,
    );
    expect(input.draft.changes).toMatchObject([
      {
        providerStopId: 'P',
        platformCode: 'B',
        platformId: 'reverse-S',
        canonicalServiceIds: ['REVERSE'],
        reviewedServiceIds: ['REVERSE', 'SVC'],
      },
      {
        providerStopId: 'Q',
        platformCode: 'A',
        platformId: 'reverse-D',
        canonicalServiceIds: ['REVERSE'],
        reviewedServiceIds: ['REVERSE', 'SVC'],
      },
    ]);
    expect(
      input.draft.dateReview.patterns.every((pattern) =>
        pattern.reviewCells.every((cell) => cell.disposition === 'proposed'),
      ),
    ).toBe(true);
    expect(evaluate(input)).toMatchObject({
      valid: true,
      readiness: 'unapproved',
      approvalMatches: false,
      mappingReviewEligible: false,
    });
    expect(evaluate(input, approval(input.draft))).toMatchObject({
      valid: true,
      mappingReviewEligible: true,
      generationEligible: false,
    });
    expect(() =>
      evaluateScheduledHolidayMapping(
        input.context,
        input.holidayPolicy,
        input.calendar,
        input.draft.dateReview,
        input.draft.mapping,
      ),
    ).toThrow();
    expect(() =>
      evaluate(input, {
        ...approval(input.draft),
        documentKind: 'gtfs-platform-label-mapping-approval',
      }),
    ).toThrow();
  });

  it('rejects stale rules, ambiguous physical targets, unknown services, duplicate rules and collapsed groups', () => {
    const scenarios = [
      (source: ReturnType<typeof fixture>) => {
        source.context.identity.sourceManifest = {
          'stops.txt': 'f'.repeat(64),
        };
      },
      (source: ReturnType<typeof fixture>) => {
        source.policy.allocations[0].platformCode = 'A';
      },
      (source: ReturnType<typeof fixture>) => {
        source.policy.allocations[0].stationId = 'D';
      },
      (source: ReturnType<typeof fixture>) => {
        source.policy.allocations[0].serviceIds = ['UNKNOWN'];
      },
      (source: ReturnType<typeof fixture>) => {
        source.policy.allocations.push({ ...source.policy.allocations[0] });
      },
      (source: ReturnType<typeof fixture>) => {
        source.policy.allocations[0].platformCode = 'A/B';
      },
      (source: ReturnType<typeof fixture>) => {
        source.context.topology.stations[0].platforms[1].label = 'A';
      },
    ];
    for (const change of scenarios) {
      const source = fixture();
      change(source);
      expect(() => prepare(source)).toThrow();
    }
    const stale = prepare();
    const review = approval(stale.draft);
    stale.policy.revision = 'synthetic-v2';
    expect(evaluate(stale, review)).toMatchObject({
      valid: false,
      mappingReviewEligible: false,
    });
    const edited = prepare();
    edited.draft.changes[0].canonicalServiceIds = ['SVC'];
    expect(evaluate(edited, approval(edited.draft))).toMatchObject({
      valid: false,
      mappingReviewEligible: false,
    });
  });

  it('still blocks restricted boarding and preserves after-midnight service dates', () => {
    for (const status of ['not_in_service', 'alighting_only'] as const) {
      const source = fixture();
      source.context.topology.stations[0].platforms[1].boardingStatus = status;
      source.context.identity.topology.sha256 = hashBytes(
        Buffer.from(JSON.stringify(source.context.topology)),
      );
      const input = prepare(source);
      expect(evaluate(input, approval(input.draft))).toMatchObject({
        valid: true,
        readiness: 'unresolved',
        coverageComplete: true,
        mappingReviewEligible: false,
        generationEligible: false,
      });
      expect(
        input.draft.dateReview.patterns.find(
          (pattern) => pattern.providerCalendarId === 'SU',
        )?.serviceDates,
      ).toContain('2026-01-01');
      expect(
        input.draft.dateReview.patterns.find(
          (pattern) => pattern.providerCalendarId === 'SA',
        )?.serviceDates,
      ).not.toContain('2026-01-01');
      expect(source.context.tables['stop_times.txt'][0].departure_time).toBe(
        '25:00:00',
      );
    }
  });
});
