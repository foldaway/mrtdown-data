import z from 'zod';
import { ScheduledTimetableSchema } from './ScheduledTimetable.js';
import { ScheduledTripPatternSchema } from './ScheduledTripPattern.js';

const dateRange = z
  .object({ startDate: z.iso.date(), endDate: z.iso.date() })
  .strict()
  .refine((range) => range.startDate <= range.endDate, {
    path: ['endDate'],
    message: 'Assignment range end cannot precede its start',
  });

/** Compact allocation content; source calendars still determine active dates. */
export const ScheduledAssignedTimetableSchema = z
  .object({
    schemaVersion: z.literal(1),
    timetable: ScheduledTimetableSchema,
    patterns: z.array(
      z
        .object({ id: z.string().min(1), pattern: ScheduledTripPatternSchema })
        .strict(),
    ),
    assignments: z.array(
      z
        .object({
          providerTripId: z.string().min(1),
          patternId: z.string().min(1),
          dateRanges: z.array(dateRange).min(1),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((value, context) => {
    const trips = new Map(
      value.timetable.trips.map((trip) => [trip.providerTripId, trip]),
    );
    const patterns = new Map<
      string,
      (typeof value.patterns)[number]['pattern']
    >();
    for (const [index, { id, pattern }] of value.patterns.entries()) {
      if (patterns.has(id)) {
        context.addIssue({
          code: 'custom',
          path: ['patterns', index, 'id'],
          message: 'Duplicate pattern ID',
        });
      }
      patterns.set(id, pattern);
    }
    const rangesByTrip = new Map<
      string,
      { startDate: string; endDate: string; index: number }[]
    >();
    for (const [index, assignment] of value.assignments.entries()) {
      const trip = trips.get(assignment.providerTripId);
      const pattern = patterns.get(assignment.patternId);
      const issue = (field: string, message: string) =>
        context.addIssue({
          code: 'custom',
          path: ['assignments', index, field],
          message,
        });
      if (!trip) {
        issue('providerTripId', 'Assignment references a missing source trip');
      }
      if (!pattern) {
        issue('patternId', 'Assignment references a missing canonical pattern');
      }
      if (trip && pattern && trip.stopTimes.length !== pattern.stops.length) {
        issue('patternId', 'Source and canonical occurrence counts differ');
      }
      const ranges = rangesByTrip.get(assignment.providerTripId) ?? [];
      ranges.push(
        ...assignment.dateRanges.map((range) => ({ ...range, index })),
      );
      rangesByTrip.set(assignment.providerTripId, ranges);
    }
    for (const ranges of rangesByTrip.values()) {
      ranges.sort((a, b) =>
        a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0,
      );
      let previousEnd = '';
      for (const range of ranges) {
        if (range.startDate <= previousEnd) {
          context.addIssue({
            code: 'custom',
            path: ['assignments', range.index, 'dateRanges'],
            message: 'Overlapping assignment ranges for source trip',
          });
        }
        if (range.endDate > previousEnd) {
          previousEnd = range.endDate;
        }
      }
    }
  });

export type ScheduledAssignedTimetable = z.infer<
  typeof ScheduledAssignedTimetableSchema
>;
