import { ScheduledWeekdaysSchema } from '@mrtdown/core';
import z from 'zod';
import { compareStrings } from './order.js';
import { ReconciliationIdentitySchema } from './reconciliation.js';
import { activeServiceDates } from './reconciliationEvidence.js';
import { auditSchedule } from './schedule.js';
import { scheduledServiceCalendarFromGtfs } from './scheduledServiceCalendar.js';
import {
  fingerprint,
  type ScopedReviewContext,
} from './scopedReviewContract.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const ScheduledHolidayCalendarSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.string().min(1),
    checkedOn: z.iso.date(),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    source: z
      .object({
        publisher: z.string().min(1),
        datasetId: z.string().min(1),
        datasetUrl: z.url(),
        datasetUpdatedOn: z.iso.date(),
        retrievedUrl: z.url(),
        retrievedBytesSha256: digest,
        retrievedByteLength: z.number().int().positive(),
        recordCount: z.number().int().positive(),
        announcementUrl: z.url(),
      })
      .strict(),
    dates: z
      .array(
        z
          .object({
            date: z.iso.date(),
            name: z.string().min(1),
            observed: z.boolean(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((calendar, context) => {
    if (
      calendar.startDate > calendar.endDate ||
      new Set(calendar.dates.map(({ date }) => date)).size !==
        calendar.dates.length ||
      calendar.source.recordCount !== calendar.dates.length ||
      calendar.dates.some(
        ({ date }) => date < calendar.startDate || date > calendar.endDate,
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Invalid holiday date population',
      });
    }
  });

export const ScheduledHolidayPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.string().min(1),
    rule: z.literal('sunday-on-public-holidays'),
    sourceManifest: ReconciliationIdentitySchema.shape.sourceManifest,
    holidayCalendarSha256: digest,
    families: z
      .array(
        z
          .object({
            lineId: z.string().min(1),
            providerRouteIds: z.array(z.string().min(1)).min(1),
            weekdayCalendarId: z.string().min(1),
            saturdayCalendarId: z.string().min(1),
            sundayCalendarId: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type ScheduledHolidayPolicy = z.infer<
  typeof ScheduledHolidayPolicySchema
>;

export function scheduledHolidayCalendarSha256(input: unknown) {
  return fingerprint(ScheduledHolidayCalendarSchema.parse(input));
}

/** Resolve original service dates only. Source trips, times and calendars stay literal. */
export function resolveScheduledHolidayDates(
  context: ScopedReviewContext,
  policyInput?: unknown,
  holidayCalendarInput?: unknown,
) {
  const audit = auditSchedule(context.tables);
  if (audit.structuralErrors.length) {
    throw new Error(
      'Structurally invalid schedule cannot resolve holiday dates',
    );
  }
  const sourceDates = new Map(
    [...new Set(audit.patterns.map((pattern) => pattern.calendarId))].map(
      (id) => {
        scheduledServiceCalendarFromGtfs(context.tables, id);
        return [id, activeServiceDates(context.tables, id)] as const;
      },
    ),
  );
  const policy =
    policyInput === undefined
      ? null
      : ScheduledHolidayPolicySchema.parse(policyInput);
  const familiesByRoute = new Map<
    string,
    ScheduledHolidayPolicy['families'][number]
  >();
  let holidays = new Set<string>();
  if (policy) {
    const calendar = ScheduledHolidayCalendarSchema.parse(holidayCalendarInput);
    if (
      fingerprint(policy.sourceManifest) !==
      fingerprint(context.identity.sourceManifest)
    ) {
      throw new Error(
        'Holiday policy source manifest differs from verified context',
      );
    }
    if (
      policy.holidayCalendarSha256 !== scheduledHolidayCalendarSha256(calendar)
    ) {
      throw new Error('Holiday calendar differs from pinned policy');
    }
    holidays = new Set(calendar.dates.map(({ date }) => date));
    for (const family of policy.families) {
      const ids = [
        family.weekdayCalendarId,
        family.saturdayCalendarId,
        family.sundayCalendarId,
      ];
      if (new Set(ids).size !== 3) {
        throw new Error(
          'Holiday family requires distinct weekday, Saturday and Sunday calendars',
        );
      }
      const calendars = ids.map((id) =>
        scheduledServiceCalendarFromGtfs(context.tables, id),
      );
      for (const [index, source] of calendars.entries()) {
        if (source.exceptions.length) {
          throw new Error(
            'Holiday substitution does not support explicit source exceptions in a bound calendar',
          );
        }
        const weekly = source.weekly;
        if (
          !weekly ||
          weekly.startDate < calendar.startDate ||
          weekly.endDate > calendar.endDate ||
          weekly.startDate !== calendars[0].weekly?.startDate ||
          weekly.endDate !== calendars[0].weekly?.endDate
        ) {
          throw new Error(
            'Holiday family requires equal weekly bounds within the known holiday date range',
          );
        }
        const expected = Object.fromEntries(
          Object.keys(ScheduledWeekdaysSchema.shape).map((day) => [
            day,
            index === 0
              ? day !== 'saturday' && day !== 'sunday'
              : day === (index === 1 ? 'saturday' : 'sunday'),
          ]),
        );
        if (fingerprint(weekly.weekdays) !== fingerprint(expected)) {
          throw new Error('Unsupported holiday family weekly calendar');
        }
      }
      for (const route of family.providerRouteIds) {
        if (familiesByRoute.has(route)) {
          throw new Error('Duplicate holiday family route');
        }
        const patterns = audit.patterns.filter(
          (pattern) => pattern.routeId === route,
        );
        if (
          !patterns.length ||
          patterns.some((pattern) => !ids.includes(pattern.calendarId)) ||
          ids.some(
            (id) => !patterns.some((pattern) => pattern.calendarId === id),
          )
        ) {
          throw new Error(
            'Holiday family requires reviewed route trips in all three calendars',
          );
        }
        familiesByRoute.set(route, family);
      }
    }
  }
  const patterns = audit.patterns.map((pattern) => {
    const literal = sourceDates.get(pattern.calendarId);
    if (!literal) {
      throw new Error('Missing source calendar dates');
    }
    const dates = new Set(literal);
    const family = familiesByRoute.get(pattern.routeId);
    if (family) {
      const weekly = scheduledServiceCalendarFromGtfs(
        context.tables,
        pattern.calendarId,
      ).weekly;
      if (!weekly) {
        throw new Error('Missing bound weekly calendar');
      }
      for (const date of holidays) {
        if (date < weekly.startDate || date > weekly.endDate) {
          continue;
        }
        if (pattern.calendarId === family.sundayCalendarId) {
          dates.add(date);
        } else {
          dates.delete(date);
        }
      }
    }
    const serviceDates = [...dates].sort(compareStrings);
    return {
      providerPatternId: pattern.id,
      routeId: pattern.routeId,
      providerCalendarId: pattern.calendarId,
      lineId: family?.lineId ?? null,
      tripIds: pattern.tripIds,
      sourceServiceDates: literal,
      serviceDates,
      addedServiceDates: serviceDates.filter((date) => !literal.includes(date)),
      removedServiceDates: literal.filter((date) => !dates.has(date)),
    };
  });
  return {
    policy,
    policySha256: policy ? fingerprint(policy) : null,
    datePopulationSha256: fingerprint(patterns),
    patterns,
    generationEligible: false as const,
  };
}
