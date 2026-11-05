import { describe, expect, it } from 'vitest';
import { holidayFixture } from './__tests__/holidayFixture.js';
import { hashBytes } from './capture.js';
import {
  evaluateScheduledHolidayMapping,
  ScheduledHolidayMappingDraftSchema,
} from './scheduledHolidayMapping.js';
import { createScheduledHolidayReviewDraft } from './scheduledHolidayReview.js';
import {
  createScheduledPlatformLabelMappingDraft,
  evaluateScheduledPlatformLabelMapping,
  scheduledPlatformLabelMappingDraftSha256,
} from './scheduledPlatformLabels.js';

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
  for (const row of context.tables['stops.txt']) {
    if (row.stop_id === 'P' || row.stop_id === 'Q') {
      row.platform_code = row.stop_id === 'P' ? 'B' : 'A';
    }
  }
  const policy = {
    schemaVersion: 1,
    revision: 'synthetic-platform-interpretation-v1',
    sourceManifest: context.identity.sourceManifest,
    corrections: [
      {
        providerStopId: 'P',
        stationId: 'S',
        lineId: 'NEL',
        expectedPlatformCode: 'B',
        platformCode: 'A',
        reason: 'Synthetic source-label correction',
      },
      {
        providerStopId: 'Q',
        stationId: 'D',
        lineId: 'NEL',
        expectedPlatformCode: 'A',
        platformCode: 'B',
        reason: 'Synthetic source-label correction',
      },
    ],
  };
  return { context, policy, holidayPolicy, calendar };
}

function prepare(input = fixture()) {
  const draft = createScheduledPlatformLabelMappingDraft(
    input.context,
    input.policy,
    input.holidayPolicy,
    input.calendar,
  );
  return { ...input, draft };
}
type Prepared = ReturnType<typeof prepare>;
function approval(draft: Prepared['draft']) {
  return {
    schemaVersion: 1,
    documentKind: 'gtfs-platform-label-mapping-approval',
    identity: draft.identity,
    draftSha256: scheduledPlatformLabelMappingDraftSha256(draft),
    reviewer: 'Synthetic reviewer',
    reason: 'Synthetic approval of both source interpretation and mappings',
  };
}
function evaluate(input: Prepared, review?: unknown) {
  return evaluateScheduledPlatformLabelMapping(
    input.context,
    input.policy,
    input.holidayPolicy,
    input.calendar,
    input.draft,
    review,
  );
}

describe('explicit source platform-label review', () => {
  it('preserves original evidence, isolates literal review, and requires approval covering the interpretation', () => {
    const source = fixture();
    const original = structuredClone(source);
    const input = prepare(source);
    expect(source).toEqual(original);
    expect(input.draft.identity.source).toEqual(source.context.identity);
    expect(
      input.draft.identity.interpretedSourceManifest['stops.txt'],
    ).not.toBe(source.context.identity.sourceManifest['stops.txt']);
    expect(input.draft.changes).toMatchObject([
      {
        providerStopId: 'P',
        originalPlatformCode: 'B',
        platformCode: 'A',
        platformId: 'platform-S',
      },
      {
        providerStopId: 'Q',
        originalPlatformCode: 'A',
        platformCode: 'B',
        platformId: 'platform-D',
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
    const reviewed = approval(input.draft);
    expect(evaluate(input, reviewed)).toMatchObject({
      valid: true,
      mappingReviewEligible: true,
      generationEligible: false,
    });
    expect(
      ScheduledHolidayMappingDraftSchema.safeParse(input.draft).success,
    ).toBe(false);
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
        ...reviewed,
        documentKind: 'gtfs-holiday-mapping-approval',
      }),
    ).toThrow();
    input.draft.policy.corrections[0].reason = 'Edited proposal';
    expect(evaluate(input, reviewed)).toMatchObject({
      valid: false,
      approvalMatches: false,
      mappingReviewEligible: false,
    });
  });

  it('rejects stale or ambiguous source rules, cross-station targets, duplicate rules and collapsed groups', () => {
    const scenarios = [
      (input: ReturnType<typeof fixture>) => {
        input.context.identity.sourceManifest = { 'stops.txt': 'f'.repeat(64) };
      },
      (input: ReturnType<typeof fixture>) => {
        input.policy.corrections[0].expectedPlatformCode = 'C';
      },
      (input: ReturnType<typeof fixture>) => {
        input.policy.corrections[0].stationId = 'D';
      },
      (input: ReturnType<typeof fixture>) => {
        input.policy.corrections[0].platformCode = 'Z';
      },
      (input: ReturnType<typeof fixture>) => {
        input.policy.corrections.push({ ...input.policy.corrections[0] });
      },
      (input: ReturnType<typeof fixture>) => {
        input.policy.corrections[0].expectedPlatformCode = 'B/C';
      },
      (input: ReturnType<typeof fixture>) => {
        input.policy.corrections[0].platformCode = 'A/C';
      },
    ];
    for (const change of scenarios) {
      const input = fixture();
      change(input);
      expect(() => prepare(input)).toThrow();
    }
    const stale = prepare();
    const reviewed = approval(stale.draft);
    stale.policy.revision = 'synthetic-v2';
    expect(evaluate(stale, reviewed)).toMatchObject({
      valid: false,
      mappingReviewEligible: false,
    });
    const claims = prepare();
    claims.draft.changes[0].originalRecordSha256 = 'f'.repeat(64);
    expect(evaluate(claims, approval(claims.draft))).toMatchObject({
      valid: false,
      mappingReviewEligible: false,
    });
  });

  it('still enforces canonical boarding restrictions and original after-midnight service dates', () => {
    const source = fixture();
    source.context.topology.stations[0].platforms[0].boardingStatus =
      'not_in_service';
    source.context.identity.topology.sha256 = hashBytes(
      Buffer.from(JSON.stringify(source.context.topology)),
    );
    const input = prepare(source);
    expect(evaluate(input, approval(input.draft))).toMatchObject({
      valid: true,
      readiness: 'unresolved',
      mappingReviewEligible: false,
      generationEligible: false,
    });
    const sunday = input.draft.dateReview.patterns.find(
      (pattern) => pattern.providerCalendarId === 'SU',
    );
    expect(sunday?.serviceDates).toContain('2026-01-01');
    expect(source.context.tables['stop_times.txt'][0].departure_time).toBe(
      '25:00:00',
    );
    expect(
      input.draft.dateReview.patterns.find(
        (pattern) => pattern.providerCalendarId === 'SA',
      )?.serviceDates,
    ).not.toContain('2026-01-01');
  });

  it('retains newly conflicting short workings when a label swap helps the main service', () => {
    const source = fixture();
    source.context.topology.services.push({
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
    source.context.topology.lines[0].serviceIds.push('REVERSE');
    for (const station of source.context.topology.stations) {
      station.platforms.push({
        ...station.platforms[0],
        id: `reverse-${station.id}`,
        label: station.id === 'S' ? 'B' : 'A',
        serviceIds: ['REVERSE'],
      });
    }
    source.context.identity.topology.sha256 = hashBytes(
      Buffer.from(JSON.stringify(source.context.topology)),
    );
    source.context.tables['trips.txt'].push({
      route_id: 'NEL_TEST',
      service_id: 'WD',
      trip_id: 'SHORT',
      direction_id: '1',
    });
    source.context.tables['stop_times.txt'].push(
      ...['Q', 'P'].map((stop_id, index) => ({
        trip_id: 'SHORT',
        stop_id,
        stop_sequence: String(index + 1),
        arrival_time: '10:00:00',
        departure_time: '10:00:00',
      })),
    );
    const before = createScheduledHolidayReviewDraft(
      source.context,
      source.holidayPolicy,
      source.calendar,
    );
    expect(
      before.patterns.find((pattern) => pattern.tripIds.includes('SHORT'))
        ?.reviewCells[0].disposition,
    ).toBe('proposed');
    const input = prepare(source);
    expect(
      input.draft.dateReview.patterns.find((pattern) =>
        pattern.tripIds.includes('SHORT'),
      )?.reviewCells[0].disposition,
    ).toBe('unresolved');
    expect(evaluate(input, approval(input.draft))).toMatchObject({
      coverageComplete: true,
      readiness: 'unresolved',
      mappingReviewEligible: false,
      generationEligible: false,
    });
  });
});
