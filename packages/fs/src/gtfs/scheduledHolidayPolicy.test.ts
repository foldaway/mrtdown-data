import { describe, expect, it } from 'vitest';
import { holidayFixture } from './__tests__/holidayFixture.js';
import { createScheduledTripAssignmentProposals } from './assignmentProposals.js';
import { hashBytes } from './capture.js';
import { resolveScheduledHolidayDates } from './scheduledHolidayPolicy.js';
import {
  createScheduledHolidayReviewDraft,
  verifyScheduledHolidayReviewDraft,
} from './scheduledHolidayReview.js';
import type { ScopedReviewContext } from './scopedReviewContract.js';

describe('reviewed holiday service dates', () => {
  it('allows explicit short-working routes to share a complete family without inventing missing trips', () => {
    const { context, policy, calendar } = holidayFixture();
    context.tables['routes.txt'].push({
      route_id: 'NEL_SHORT',
      agency_id: 'SBST',
      route_type: '1',
    });
    const sunday = context.tables['trips.txt'].find(
      (row) => row.trip_id === 'NEL_TEST_SU',
    );
    if (!sunday) throw new Error('Missing synthetic Sunday trip');
    sunday.route_id = 'NEL_SHORT';
    policy.families[0].providerRouteIds.push('NEL_SHORT');
    const resolved = resolveScheduledHolidayDates(context, policy, calendar);
    expect(
      resolved.patterns
        .filter((pattern) => pattern.routeId === 'NEL_TEST')
        .map((pattern) => pattern.providerCalendarId)
        .sort(),
    ).toEqual(['SA', 'WD']);
    const short = resolved.patterns.find(
      (pattern) => pattern.routeId === 'NEL_SHORT',
    );
    expect(short?.tripIds).toEqual(['NEL_TEST_SU']);
    expect(short?.serviceDates).toContain('2026-01-01');
    expect(short?.addedServiceDates).toContain('2026-03-21');
    expect(() =>
      resolveScheduledHolidayDates(
        context,
        {
          ...policy,
          families: [{ ...policy.families[0], providerRouteIds: ['NEL_TEST'] }],
        },
        calendar,
      ),
    ).toThrow(/all three calendars/);
  });

  it('replaces weekday and Saturday service with Sunday dates within the reviewed family', () => {
    const { context, policy, calendar } = holidayFixture();
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

  it('preserves literal exceptions in an unrelated calendar while substituting the bound family', () => {
    const { context, policy, calendar } = holidayFixture();
    context.tables['calendar.txt'].push({
      ...context.tables['calendar.txt'][0],
      service_id: 'UNBOUND_WD',
    });
    const trip = context.tables['trips.txt'].find(
      (row) => row.trip_id === 'NSL_TEST_WD',
    );
    if (!trip) throw new Error('Missing synthetic unbound trip');
    trip.service_id = 'UNBOUND_WD';
    context.tables['calendar_dates.txt'] = [
      { service_id: 'UNBOUND_WD', date: '20260104', exception_type: '1' },
    ];
    const literal = resolveScheduledHolidayDates(context);
    const resolved = resolveScheduledHolidayDates(context, policy, calendar);
    const unbound = resolved.patterns.filter(
      (pattern) => pattern.routeId === 'NSL_TEST',
    );
    for (const pattern of unbound) {
      expect(pattern).toEqual(
        literal.patterns.find(
          (source) => source.providerPatternId === pattern.providerPatternId,
        ),
      );
    }
    expect(
      unbound.find((pattern) => pattern.providerCalendarId === 'UNBOUND_WD')
        ?.serviceDates,
    ).toEqual(expect.arrayContaining(['2026-01-01', '2026-01-04']));
    expect(
      resolved.patterns.find(
        (pattern) =>
          pattern.routeId === 'NEL_TEST' && pattern.providerCalendarId === 'WD',
      )?.serviceDates,
    ).not.toContain('2026-01-01');
  });

  it('requires pinned dates and source identity, with no inferred policy when omitted', () => {
    const { context, policy, calendar } = holidayFixture();
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
      const { context, policy, calendar } = holidayFixture();
      scenario.change(context);
      expect(() =>
        resolveScheduledHolidayDates(context, policy, calendar),
      ).toThrow(scenario.error);
    }
  });

  it('checks canonical coverage on added and retained dates and rejects stale drafts', () => {
    const { context, policy, calendar } = holidayFixture();
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
      const inputs = holidayFixture();
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
