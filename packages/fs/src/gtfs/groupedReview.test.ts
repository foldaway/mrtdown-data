import { describe, expect, it } from 'vitest';
import { hashBytes } from './capture.js';
import {
  GroupedScopedReconciliationApprovalSchema,
  GroupedScopedReconciliationDraftSchema,
  groupedScopedReviewDraftSha256,
} from './groupedReviewContract.js';
import {
  evaluateGroupedScopedReconciliation,
  evaluateScopedReconciliation,
} from './scopedReview.js';
import {
  ScopedReconciliationDraftSchema,
  type ScopedReviewContext,
} from './scopedReviewContract.js';
import {
  createGroupedScopedReconciliationDraft,
  createScopedReconciliationDraft,
} from './scopedReviewDraft.js';

function fixture(): ScopedReviewContext {
  const tables = {
    'agency.txt': [{ agency_id: 'SMRT' }],
    'routes.txt': [
      { route_id: 'NSL_TEST', agency_id: 'SMRT', route_type: '1' },
    ],
    'stops.txt': [
      { stop_id: 'S', stop_code: 'NS1', location_type: '1' },
      {
        stop_id: 'P',
        stop_code: 'NS1',
        parent_station: 'S',
        platform_code: 'A/C',
        location_type: '0',
      },
      { stop_id: 'D', stop_code: 'NS2', location_type: '1' },
      {
        stop_id: 'Q',
        stop_code: 'NS2',
        parent_station: 'D',
        platform_code: 'B',
        location_type: '0',
      },
    ],
    'calendar.txt': [
      {
        service_id: 'C',
        monday: '1',
        tuesday: '1',
        wednesday: '1',
        thursday: '1',
        friday: '1',
        saturday: '1',
        sunday: '1',
        start_date: '20260101',
        end_date: '20260103',
      },
    ],
    'trips.txt': [
      {
        route_id: 'NSL_TEST',
        service_id: 'C',
        trip_id: 'T',
        direction_id: '0',
      },
    ],
    'stop_times.txt': [
      {
        trip_id: 'T',
        stop_id: 'P',
        stop_sequence: '1',
        arrival_time: '08:00:00',
        departure_time: '08:00:00',
      },
      {
        trip_id: 'T',
        stop_id: 'Q',
        stop_sequence: '2',
        arrival_time: '08:02:00',
        departure_time: '08:02:00',
      },
    ],
  };
  const topology = {
    projectionVersion: 1,
    operators: [{ id: 'SMRT_TRAINS' }],
    lines: [
      {
        id: 'NSL',
        type: 'mrt',
        serviceIds: ['SVC'],
        operators: [
          { operatorId: 'SMRT_TRAINS', startedAt: '2000-01-01', endedAt: null },
        ],
      },
    ],
    stations: ['S', 'D'].map((id, index) => ({
      id,
      stationCodes: [
        {
          lineId: 'NSL',
          code: `NS${index + 1}`,
          startedAt: '2000-01-01',
          endedAt: null,
        },
      ],
      platforms: [
        ...(!index
          ? [
              {
                id: 'platform-S-C',
                label: 'C',
                lineId: 'NSL',
                serviceIds: ['SVC'],
                boardingStatus: null,
              },
            ]
          : []),
        {
          id: `platform-${id}-${index ? 'B' : 'A'}`,
          label: index ? 'B' : 'A',
          lineId: 'NSL',
          serviceIds: ['SVC'],
          boardingStatus: null,
        },
      ],
    })),
    services: [
      {
        id: 'SVC',
        lineId: 'NSL',
        revisions: [
          {
            id: 'R',
            startAt: '2000-01-01',
            endAt: null,
            stations: [
              { stationId: 'S', displayCode: 'NS1' },
              { stationId: 'D', displayCode: 'NS2' },
            ],
          },
        ],
      },
    ],
  } as ScopedReviewContext['topology'];
  return {
    tables,
    topology,
    identity: {
      sourceManifest: { 'stops.txt': 'a'.repeat(64) },
      canonicalCommit: 'b'.repeat(40),
      topology: {
        projectionVersion: 1,
        sha256: hashBytes(Buffer.from(JSON.stringify(topology))),
      },
    },
  };
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing synthetic fixture value');
  return value;
}

type Draft = ReturnType<typeof createGroupedScopedReconciliationDraft>;
function draftFor(context = fixture()) {
  return createGroupedScopedReconciliationDraft(context, {
    pilotLineIds: ['NSL'],
    preparedBy: 'Synthetic platform-group proposal',
  });
}
function group(draft: Draft) {
  const decision = draft.decisions.find(
    (item) => item.kind === 'stop' && item.providerId === 'P',
  );
  if (decision?.target?.kind !== 'platformGroup')
    throw new Error('Expected complete synthetic platform group');
  return decision.target;
}
function approval(draft: Draft) {
  return {
    schemaVersion: 3,
    documentKind: 'gtfs-scoped-mapping-approval',
    identity: draft.identity,
    draftSha256: groupedScopedReviewDraftSha256(draft),
    reviewer: 'Synthetic test reviewer',
    reason: 'Synthetic gate assertion; no real source approval.',
  };
}
function rehash(context: ScopedReviewContext) {
  context.identity.topology.sha256 = hashBytes(
    Buffer.from(JSON.stringify(context.topology)),
  );
}
function origin(context: ScopedReviewContext) {
  const station = context.topology.stations.find(
    (station) => station.id === 'S',
  );
  if (!station) throw new Error('Missing origin');
  return station;
}
function unresolvedOrigin(context: ScopedReviewContext) {
  const draft = draftFor(context);
  expect(
    draft.decisions.find(
      (item) => item.kind === 'stop' && item.providerId === 'P',
    ),
  ).toMatchObject({ disposition: 'unresolved' });
  expect(draft.decisions.filter((item) => item.kind === 'pattern')).toEqual([
    expect.objectContaining({ disposition: 'unresolved' }),
  ]);
  expect(evaluateGroupedScopedReconciliation(context, draft)).toMatchObject({
    valid: true,
    matchedPatternDates: 0,
    mappingReviewEligible: false,
    generationEligible: false,
  });
}

describe('opt-in grouped-platform scoped review', () => {
  it('retains a complete physical group without selecting one member and leaves version 2 unchanged', () => {
    const context = fixture(),
      draft = draftFor(context);
    expect(group(draft)).toEqual({
      kind: 'platformGroup',
      stationId: 'S',
      lineId: 'NSL',
      platformIds: ['platform-S-A', 'platform-S-C'],
    });
    expect(
      GroupedScopedReconciliationDraftSchema.safeParse(draft).success,
    ).toBe(true);
    expect(ScopedReconciliationDraftSchema.safeParse(draft).success).toBe(
      false,
    );
    expect(() => evaluateScopedReconciliation(context, draft)).toThrow();
    const legacy = createScopedReconciliationDraft(context, {
      pilotLineIds: ['NSL'],
      preparedBy: 'Synthetic legacy proposal',
    });
    expect(legacy.schemaVersion).toBe(2);
    expect(
      legacy.decisions.find((item) => item.providerId === 'P'),
    ).toMatchObject({ disposition: 'unresolved' });
    expect(evaluateScopedReconciliation(context, legacy)).toMatchObject({
      valid: true,
      matchedPatternDates: 0,
      generationEligible: false,
    });
    expect(evaluateGroupedScopedReconciliation(context, draft)).toMatchObject({
      valid: true,
      coverageComplete: true,
      unresolvedDecisions: 0,
      matchedPatternDates: 3,
      approvalMatches: false,
      readiness: 'unapproved',
      generationEligible: false,
    });
    expect(
      evaluateGroupedScopedReconciliation(context, draft, approval(draft)),
    ).toMatchObject({
      valid: true,
      reviewComplete: true,
      mappingReviewEligible: true,
      readiness: 'reviewed-mapping-only',
      generationEligible: false,
    });
  });

  it.each([
    'missing member',
    'same-label ambiguity',
  ] as const)('keeps %s unresolved instead of choosing a physical platform', (problem) => {
    const context = fixture(),
      station = origin(context);
    if (problem === 'missing member')
      station.platforms = station.platforms.filter(
        (platform) => platform.label !== 'C',
      );
    else
      station.platforms.push({
        ...required(station.platforms[0]),
        id: 'another-C',
      });
    rehash(context);
    unresolvedOrigin(context);
  });

  it.each([
    'A/A',
    'A/',
    'A//A',
  ])('keeps malformed literal group %s unresolved and rejects a forged single target', (label) => {
    const context = fixture();
    required(
      context.tables['stops.txt']?.find((row) => row.stop_id === 'P'),
    ).platform_code = label;
    unresolvedOrigin(context);
    // Version 2 retains its historical singleton parsing. That result cannot
    // become a version-3 allocation merely by changing its version number.
    const legacy = createScopedReconciliationDraft(context, {
      pilotLineIds: ['NSL'],
      preparedBy: 'Synthetic legacy proposal',
    });
    expect(evaluateScopedReconciliation(context, legacy)).toMatchObject({
      valid: true,
      matchedPatternDates: 3,
      generationEligible: false,
    });
    const forged = GroupedScopedReconciliationDraftSchema.parse({
      ...legacy,
      schemaVersion: 3,
    });
    expect(
      evaluateGroupedScopedReconciliation(context, forged, approval(forged)),
    ).toMatchObject({
      valid: false,
      mappingReviewEligible: false,
      generationEligible: false,
    });
  });

  it.each([
    'remove member',
    'add member',
    'wrong station',
    'wrong line',
  ] as const)('rejects a manually claimed group with %s', (mutation) => {
    const context = fixture(),
      draft = draftFor(context),
      target = group(draft);
    if (mutation === 'remove member') target.platformIds = ['platform-S-A'];
    if (mutation === 'add member') target.platformIds.push('invented-platform');
    if (mutation === 'wrong station') target.stationId = 'D';
    if (mutation === 'wrong line') target.lineId = 'EWL';
    // Structural rejection and semantic rejection both prevent approval.
    if (!GroupedScopedReconciliationDraftSchema.safeParse(draft).success) {
      expect(() =>
        evaluateGroupedScopedReconciliation(context, draft),
      ).toThrow();
    } else
      expect(
        evaluateGroupedScopedReconciliation(context, draft, approval(draft)),
      ).toMatchObject({
        valid: false,
        mappingReviewEligible: false,
        generationEligible: false,
      });
  });

  it.each([
    'service scope',
    'alighting_only',
    'not_in_service',
  ] as const)('requires every group member to pass %s, even when another member is usable', (conflict) => {
    const context = fixture(),
      safeDraft = draftFor(context);
    const member = required(
      origin(context).platforms.find((platform) => platform.label === 'C'),
    );
    if (conflict === 'service scope') member.serviceIds = ['OTHER'];
    else member.boardingStatus = conflict;
    rehash(context);
    const proposed = draftFor(context);
    expect(
      proposed.decisions.find((item) => item.providerId === 'P'),
    ).toMatchObject({ disposition: 'matched' });
    expect(
      proposed.decisions.filter((item) => item.kind === 'pattern'),
    ).toEqual([expect.objectContaining({ disposition: 'unresolved' })]);
    // Retain exact identity and add fresh review metadata to a forged matched cell:
    // neither can waive a bad member while a second member remains valid.
    safeDraft.identity = context.identity;
    expect(
      evaluateGroupedScopedReconciliation(
        context,
        safeDraft,
        approval(safeDraft),
      ),
    ).toMatchObject({
      valid: false,
      mappingReviewEligible: false,
      generationEligible: false,
    });
  });

  it('requires the station parent even for a complete physical group', () => {
    const context = fixture(),
      draft = draftFor(context);
    const parent = required(
      draft.decisions.find(
        (item) => item.kind === 'stop' && item.providerId === 'S',
      ),
    );
    parent.disposition = 'unresolved';
    delete parent.target;
    expect(
      evaluateGroupedScopedReconciliation(context, draft, approval(draft)),
    ).toMatchObject({
      valid: false,
      mappingReviewEligible: false,
      generationEligible: false,
    });
  });

  it('normalizes group order but binds approval to member identity and review text', () => {
    const context = fixture(),
      draft = draftFor(context),
      review = approval(draft);
    group(draft).platformIds.reverse();
    draft.decisions.reverse();
    expect(groupedScopedReviewDraftSha256(draft)).toBe(review.draftSha256);
    expect(
      evaluateGroupedScopedReconciliation(context, draft, review),
    ).toMatchObject({ valid: true, approvalMatches: true });
    const changedMember = structuredClone(draft);
    group(changedMember).platformIds = ['platform-S-A', 'platform-S-X'];
    expect(groupedScopedReviewDraftSha256(changedMember)).not.toBe(
      review.draftSha256,
    );
    expect(
      evaluateGroupedScopedReconciliation(context, changedMember, review),
    ).toMatchObject({ valid: false, approvalMatches: false });
    required(draft.decisions[0]).reason = 'Changed review text';
    expect(
      evaluateGroupedScopedReconciliation(context, draft, review),
    ).toMatchObject({ valid: false, approvalMatches: false });
    const oldReview = { ...review, schemaVersion: 2 };
    expect(
      GroupedScopedReconciliationApprovalSchema.safeParse(oldReview).success,
    ).toBe(false);
    expect(() =>
      evaluateGroupedScopedReconciliation(context, draft, oldReview),
    ).toThrow();
  });

  it.each([
    'source record',
    'canonical identity',
  ] as const)('continues to reject changed %s', (mutation) => {
    const context = fixture(),
      draft = draftFor(context);
    if (mutation === 'source record') {
      required(
        context.tables['stops.txt']?.find((row) => row.stop_id === 'P'),
      ).platform_code = 'A/D';
    } else draft.identity.canonicalCommit = 'c'.repeat(40);
    expect(
      evaluateGroupedScopedReconciliation(context, draft, approval(draft)),
    ).toMatchObject({
      valid: false,
      mappingReviewEligible: false,
      generationEligible: false,
    });
  });

  it.each([
    'revision',
    'station code',
    'operator',
  ] as const)('retains exact-date %s boundaries despite a complete physical group and fresh approval', (period) => {
    const context = fixture(),
      draft = draftFor(context);
    if (period === 'revision')
      required(required(context.topology.services[0]).revisions[0]).startAt =
        '2026-01-02';
    if (period === 'station code')
      required(origin(context).stationCodes[0]).startedAt = '2026-01-02';
    if (period === 'operator')
      required(required(context.topology.lines[0]).operators[0]).startedAt =
        '2026-01-02';
    rehash(context);
    draft.identity = context.identity;
    expect(
      evaluateGroupedScopedReconciliation(context, draft, approval(draft)),
    ).toMatchObject({
      valid: false,
      mappingReviewEligible: false,
      generationEligible: false,
    });
    const proposed = draftFor(context);
    expect(
      evaluateGroupedScopedReconciliation(context, proposed),
    ).toMatchObject({
      valid: true,
      matchedPatternDates: 2,
      unresolvedPatternDates: 1,
      generationEligible: false,
    });
  });
});
