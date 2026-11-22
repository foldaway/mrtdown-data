import {
  PublicHolidayCalendarSchema,
  ScheduledWeekdaysSchema,
} from '@mrtdown/core';
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
export const ScheduledHolidayCalendarSchema = PublicHolidayCalendarSchema;

export const ScheduledHolidayPolicySchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
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
            supplementalCalendarIds: z.array(z.string().min(1)).optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((policy, context) => {
    if (
      policy.schemaVersion === 1 &&
      policy.families.some(
        (family) => family.supplementalCalendarIds !== undefined,
      )
    )
      context.addIssue({
        code: 'custom',
        message: 'Supplemental calendars require holiday policy v2',
      });
  });
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
        if (source.exceptions.length && policy.schemaVersion === 1) {
          throw new Error(
            'Holiday substitution does not support explicit source exceptions in a bound calendar',
          );
        }
        if (source.exceptions.some((exception) => holidays.has(exception.date)))
          throw new Error(
            'Explicit source exceptions on public holidays require review',
          );
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
        if (
          source.exceptions.some(
            (exception) =>
              exception.date < weekly.startDate ||
              exception.date > weekly.endDate,
          )
        )
          throw new Error(
            'Source exception exceeds the primary calendar bounds',
          );
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
      const supplemental = family.supplementalCalendarIds ?? [];
      const primaryBounds = calendars[0].weekly;
      if (!primaryBounds) throw new Error('Missing primary calendar bounds');
      if (
        new Set([...ids, ...supplemental]).size !==
        ids.length + supplemental.length
      )
        throw new Error('Duplicate family calendar binding');
      for (const id of supplemental) {
        const source = scheduledServiceCalendarFromGtfs(context.tables, id);
        if (
          !source.weekly ||
          source.weekly.startDate < primaryBounds.startDate ||
          source.weekly.endDate > primaryBounds.endDate ||
          source.exceptions.some(
            (exception) =>
              exception.date < primaryBounds.startDate ||
              exception.date > primaryBounds.endDate,
          )
        )
          throw new Error(
            'Supplemental calendar exceeds the primary family bounds',
          );
        if (
          source.exceptions.some((exception) => holidays.has(exception.date)) ||
          sourceDates.get(id)?.some((date) => holidays.has(date))
        )
          throw new Error(
            'Supplemental service on public holidays requires review',
          );
      }
      for (const route of family.providerRouteIds) {
        if (familiesByRoute.has(route)) {
          throw new Error('Duplicate holiday family route');
        }
        const patterns = audit.patterns.filter(
          (pattern) => pattern.routeId === route,
        );
        if (
          (!patterns.length && policy.schemaVersion === 1) ||
          patterns.some(
            (pattern) =>
              ![...ids, ...supplemental].includes(pattern.calendarId),
          )
        ) {
          throw new Error(
            'Holiday family route requires trips only in its bound calendars',
          );
        }
        familiesByRoute.set(route, family);
      }
      // A short working can be absent on Sundays; the complete family supplies each day type.
      if (
        ids.some(
          (id) =>
            !audit.patterns.some(
              (pattern) =>
                family.providerRouteIds.includes(pattern.routeId) &&
                pattern.calendarId === id,
            ),
        )
      ) {
        throw new Error('Holiday family requires trips in all three calendars');
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
