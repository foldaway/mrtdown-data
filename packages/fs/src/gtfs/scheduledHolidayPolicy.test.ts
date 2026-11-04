import { describe, expect, it } from 'vitest';
import { createScheduledTripAssignmentProposals } from './assignmentProposals.js';
import { hashBytes } from './capture.js';
import {
  resolveScheduledHolidayDates,
  scheduledHolidayCalendarSha256,
} from './scheduledHolidayPolicy.js';
import {
  createScheduledHolidayReviewDraft,
  verifyScheduledHolidayReviewDraft,
} from './scheduledHolidayReview.js';
import type { ScopedReviewContext } from './scopedReviewContract.js';

function fixture() {
  const calendar = {
    id: 'SG-2026',
    countryCode: 'SG',
    schemaVersion: 1,
    revision: 'synthetic-2026-v1',
    checkedOn: '2026-11-03',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    source: {
      publisher: 'Synthetic test publisher',
      datasetId: 'test-holidays',
      datasetUrl: 'https://example.com/holidays',
      datasetUpdatedOn: '2026-01-01',
      retrievedUrl: 'https://example.com/holidays.csv',
      retrievedBytesSha256: 'a'.repeat(64),
      retrievedByteLength: 100,
      recordCount: 4,
      licenceUrl: 'https://example.com/licence',
      retrievedRecordCount: 4,
    },
    dates: [
      { date: '2026-01-01', name: 'Weekday holiday', observed: false },
      { date: '2026-03-21', name: 'Saturday holiday', observed: false },
      { date: '2026-11-08', name: 'Sunday holiday', observed: false },
      { date: '2026-11-09', name: 'Observed holiday', observed: true },
    ],
  };
  const context: ScopedReviewContext = {
    tables: {
      'agency.txt': [{ agency_id: 'SBST', agency_timezone: 'Asia/Singapore' }],
      'routes.txt': ['NEL_TEST', 'NSL_TEST'].map((route_id) => ({
        route_id,
        agency_id: 'SBST',
        route_type: '1',
      })),
      'stops.txt': [
        { stop_id: 'S', stop_code: 'NE1', location_type: '1' },
        {
          stop_id: 'P',
          stop_code: 'NE1',
          parent_station: 'S',
          platform_code: 'A',
          location_type: '0',
        },
        { stop_id: 'D', stop_code: 'NE3', location_type: '1' },
        {
          stop_id: 'Q',
          stop_code: 'NE3',
          parent_station: 'D',
          platform_code: 'B',
          location_type: '0',
        },
      ],
      'calendar.txt': ['WD', 'SA', 'SU'].map((service_id) => ({
        service_id,
        monday: service_id === 'WD' ? '1' : '0',
        tuesday: service_id === 'WD' ? '1' : '0',
        wednesday: service_id === 'WD' ? '1' : '0',
        thursday: service_id === 'WD' ? '1' : '0',
        friday: service_id === 'WD' ? '1' : '0',
        saturday: service_id === 'SA' ? '1' : '0',
        sunday: service_id === 'SU' ? '1' : '0',
        start_date: '20260101',
        end_date: '20261231',
      })),
      'trips.txt': ['NEL_TEST', 'NSL_TEST'].flatMap((route_id) =>
        ['WD', 'SA', 'SU'].map((service_id) => ({
          route_id,
          service_id,
          trip_id: `${route_id}_${service_id}`,
          direction_id: '0',
        })),
      ),
      'stop_times.txt': ['NEL_TEST', 'NSL_TEST'].flatMap((route) =>
        ['WD', 'SA', 'SU'].flatMap((calendarId) =>
          ['P', 'Q'].map((stop_id, index) => ({
            trip_id: `${route}_${calendarId}`,
            stop_id,
            stop_sequence: String(index + 1),
            arrival_time: index ? '25:02:00' : '25:00:00',
            departure_time: index ? '25:02:00' : '25:00:00',
          })),
        ),
      ),
    },
    topology: {
      projectionVersion: 1,
      operators: [{ id: 'SBS' }],
      lines: [
        {
          id: 'NEL',
          type: 'mrt',
          serviceIds: ['SVC'],
          operators: [
            { operatorId: 'SBS', startedAt: '2000-01-01', endedAt: null },
          ],
        },
      ],
      stations: ['S', 'D'].map((id, index) => ({
        id,
        stationCodes: [
          {
            lineId: 'NEL',
            code: index ? 'NE3' : 'NE1',
            startedAt: '2000-01-01',
            endedAt: null,
          },
        ],
        platforms: [
          {
            id: `platform-${id}`,
            label: index ? 'B' : 'A',
            lineId: 'NEL',
            serviceIds: ['SVC'],
            boardingStatus: null,
          },
        ],
      })),
      services: [
        {
          id: 'SVC',
          lineId: 'NEL',
          revisions: [
            {
              id: 'R',
              startAt: '2000-01-01',
              endAt: null,
              stations: [
                { stationId: 'S', displayCode: 'NE1' },
                { stationId: 'D', displayCode: 'NE3' },
              ],
            },
          ],
        },
      ],
    },
    identity: {
      sourceManifest: { 'calendar.txt': 'b'.repeat(64) },
      canonicalCommit: 'c'.repeat(40),
      topology: { projectionVersion: 1, sha256: '' },
    },
  };
  context.identity.topology.sha256 = hashBytes(
    Buffer.from(JSON.stringify(context.topology)),
  );
  const policy = {
    schemaVersion: 1,
    revision: 'synthetic-nel-v1',
    rule: 'sunday-on-public-holidays',
    sourceManifest: context.identity.sourceManifest,
    holidayCalendarSha256: scheduledHolidayCalendarSha256(calendar),
    families: [
      {
        lineId: 'NEL',
        providerRouteIds: ['NEL_TEST'],
        weekdayCalendarId: 'WD',
        saturdayCalendarId: 'SA',
        sundayCalendarId: 'SU',
      },
    ],
  };
  return { context, policy, calendar };
}

describe('reviewed holiday service dates', () => {
  it('replaces weekday and Saturday service with Sunday dates within the reviewed family', () => {
    const { context, policy, calendar } = fixture();
    const before = structuredClone(context);
    const literal = resolveScheduledHolidayDates(context);
    const resolved = resolveScheduledHolidayDates(context, policy, calendar);
    const nel = resolved.patterns.filter(
      (pattern) => pattern.routeId === 'NEL_TEST',
    );
    const sunday = nel.find((pattern) => pattern.providerCalendarId === 'SU');
    expect(sunday?.addedServiceDates).toEqual([
      '2026-01-01',
      '2026-03-21',
      '2026-11-09',
    ]);
    expect(
      sunday?.serviceDates.filter((date) => date === '2026-11-08'),
    ).toHaveLength(1);
    expect(
      nel.find((pattern) => pattern.providerCalendarId === 'WD')
        ?.removedServiceDates,
    ).toEqual(['2026-01-01', '2026-11-09']);
    expect(
      nel.find((pattern) => pattern.providerCalendarId === 'SA')
        ?.removedServiceDates,
    ).toEqual(['2026-03-21']);
    expect(
      nel.find((pattern) => pattern.providerCalendarId === 'WD')?.serviceDates,
    ).toContain('2026-01-02');
    for (const pattern of resolved.patterns.filter(
      (pattern) => pattern.routeId === 'NSL_TEST',
    )) {
      expect(pattern).toEqual(
        literal.patterns.find(
          (source) => source.providerPatternId === pattern.providerPatternId,
        ),
      );
    }
    // Jan 2 wall-clock events belong to Jan 1's substituted service date.
    expect(sunday?.serviceDates).not.toContain('2026-01-02');
    // A Saturday trip at 25:00 stays Saturday even when its arrival day is a holiday.
    expect(
      nel.find((pattern) => pattern.providerCalendarId === 'SA')?.serviceDates,
    ).toContain('2026-11-07');
    expect(sunday?.serviceDates).not.toContain('2026-11-07');
    expect(context).toEqual(before);
    expect(resolved.generationEligible).toBe(false);
  });

  it('requires pinned dates and source identity, with no inferred policy when omitted', () => {
    const { context, policy, calendar } = fixture();
    const literal = resolveScheduledHolidayDates(context);
    expect(literal.policySha256).toBeNull();
    expect(
      literal.patterns.every(
        (pattern) =>
          JSON.stringify(pattern.serviceDates) ===
          JSON.stringify(pattern.sourceServiceDates),
      ),
    ).toBe(true);
    expect(() =>
      resolveScheduledHolidayDates(
        context,
        {
          ...policy,
          sourceManifest: { 'calendar.txt': 'd'.repeat(64) },
        },
        calendar,
      ),
    ).toThrow(/manifest/);
    expect(() =>
      resolveScheduledHolidayDates(
        context,
        {
          ...policy,
          holidayCalendarSha256: 'd'.repeat(64),
        },
        calendar,
      ),
    ).toThrow(/pinned policy/);
    expect(() => resolveScheduledHolidayDates(context, policy)).toThrow();
  });

  it('fails closed on dated exceptions, unknown years and unsupported weekly families', () => {
    const cases = [
      {
        change(context: ScopedReviewContext) {
          context.tables['calendar_dates.txt'] = [
            { service_id: 'WD', date: '20260101', exception_type: '2' },
          ];
        },
        error: /explicit source exceptions/,
      },
      {
        change(context: ScopedReviewContext) {
          for (const row of context.tables['calendar.txt']) {
            row.end_date = '20270101';
          }
        },
        error: /known holiday date range/,
      },
      {
        change(context: ScopedReviewContext) {
          context.tables['calendar.txt'][0].sunday = '1';
        },
        error: /weekly calendar/,
      },
    ];
    for (const scenario of cases) {
      const { context, policy, calendar } = fixture();
      scenario.change(context);
      expect(() =>
        resolveScheduledHolidayDates(context, policy, calendar),
      ).toThrow(scenario.error);
    }
  });

  it('checks canonical coverage on added and retained dates and rejects stale drafts', () => {
    const { context, policy, calendar } = fixture();
    const draft = createScheduledHolidayReviewDraft(context, policy, calendar);
    const sunday = draft.patterns.find(
      (pattern) => pattern.providerCalendarId === 'SU',
    );
    expect(sunday?.sourceServiceDates).not.toContain('2026-01-01');
    expect(
      sunday?.reviewCells.find((cell) =>
        cell.serviceDates.includes('2026-01-01'),
      )?.disposition,
    ).toBe('proposed');
    expect(
      draft.patterns
        .find((pattern) => pattern.providerCalendarId === 'WD')
        ?.reviewCells.find((cell) => cell.serviceDates.includes('2026-01-02'))
        ?.disposition,
    ).toBe('proposed');
    expect(
      verifyScheduledHolidayReviewDraft(context, policy, calendar, draft).valid,
    ).toBe(true);
    expect(draft.mappingReviewEligible).toBe(false);
    expect(() =>
      createScheduledTripAssignmentProposals(context, draft),
    ).toThrow();
    expect(() =>
      verifyScheduledHolidayReviewDraft(
        context,
        {
          ...policy,
          revision: 'synthetic-nel-v2',
        },
        calendar,
        draft,
      ),
    ).toThrow(/stale/);
    const tampered = structuredClone(draft);
    tampered.patterns[0].serviceDates = [];
    expect(() =>
      verifyScheduledHolidayReviewDraft(context, policy, calendar, tampered),
    ).toThrow(/differs/);

    const shortened = structuredClone(context);
    shortened.topology.services[0].revisions[0].endAt = '2026-01-02';
    shortened.identity.topology.sha256 = hashBytes(
      Buffer.from(JSON.stringify(shortened.topology)),
    );
    const shortenedDraft = createScheduledHolidayReviewDraft(
      shortened,
      policy,
      calendar,
    );
    expect(
      shortenedDraft.patterns
        .find((pattern) => pattern.providerCalendarId === 'WD')
        ?.reviewCells.find((cell) => cell.serviceDates.includes('2026-01-02'))
        ?.disposition,
    ).toBe('unresolved');
    expect(
      shortenedDraft.patterns
        .find((pattern) => pattern.providerCalendarId === 'SU')
        ?.reviewCells.find((cell) => cell.serviceDates.includes('2026-01-01'))
        ?.disposition,
    ).toBe('proposed');

    const cases = [
      {
        change(input: ScopedReviewContext) {
          input.topology.services[0].revisions[0].startAt = '2026-01-02';
        },
        blocker: 'temporal-gap',
      },
      {
        change(input: ScopedReviewContext) {
          input.topology.stations[0].stationCodes[0].startedAt = '2026-01-02';
        },
        blocker: 'temporal-gap',
      },
      {
        change(input: ScopedReviewContext) {
          input.topology.stations[0].platforms[0].boardingStatus =
            'not_in_service';
        },
        blocker: 'platform-or-boarding',
      },
      {
        change(input: ScopedReviewContext) {
          input.topology.lines[0].operators[0].startedAt = '2026-01-02';
        },
        blocker: 'operator-period',
      },
    ];
    for (const scenario of cases) {
      const inputs = fixture();
      scenario.change(inputs.context);
      inputs.context.identity.topology.sha256 = hashBytes(
        Buffer.from(JSON.stringify(inputs.context.topology)),
      );
      const checked = createScheduledHolidayReviewDraft(
        inputs.context,
        inputs.policy,
        inputs.calendar,
      );
      const cell = checked.patterns
        .find((pattern) => pattern.providerCalendarId === 'SU')
        ?.reviewCells.find((item) => item.serviceDates.includes('2026-01-01'));
      expect(cell?.disposition).toBe('unresolved');
      expect(cell?.blockers).toContain(scenario.blocker);
      expect(() =>
        verifyScheduledHolidayReviewDraft(
          inputs.context,
          inputs.policy,
          inputs.calendar,
          draft,
        ),
      ).toThrow(/stale/);
    }
  });
});
