import { DateTime } from 'luxon';
import z from 'zod';
import { Tool } from '../../../common/tool.js';

const ResolveRelativeDateToolParametersSchema = z.object({
  weekday: z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']),
  weekOffset: z.number().int(),
  referenceTs: z.string(),
  timeZone: z.literal('Asia/Singapore').default('Asia/Singapore'),
});

type ResolveRelativeDateToolParameters = z.infer<
  typeof ResolveRelativeDateToolParametersSchema
>;

type ResolvedRelativeDateResult = {
  resolved: boolean;
  weekday: ResolveRelativeDateToolParameters['weekday'];
  weekOffset: number;
  granularity: 'day' | 'range' | null;
  startAt: string | null;
  endAt: string | null;
  note: string | null;
};

export class ResolveRelativeDateTool extends Tool<ResolveRelativeDateToolParameters> {
  public name = 'resolveRelativeDate';
  public description =
    'Resolve weekday and week offset against evidence timestamp';

  public get paramsSchema(): { [key: string]: unknown } {
    return z.toJSONSchema(ResolveRelativeDateToolParametersSchema);
  }

  public parseParams(params: unknown): ResolveRelativeDateToolParameters {
    return ResolveRelativeDateToolParametersSchema.parse(params);
  }

  public async runner(
    params: ResolveRelativeDateToolParameters,
  ): Promise<string> {
    console.log('[resolveRelativeDate] Calling tool with parameters:', params);
    const result = resolveRelativeDatePhrase(params);
    const output = JSON.stringify(result, null, 2);
    console.log(`[resolveRelativeDate] Response output:\n${output}`);
    return output;
  }
}

function resolveRelativeDatePhrase(
  params: ResolveRelativeDateToolParameters,
): ResolvedRelativeDateResult {
  const reference = DateTime.fromISO(params.referenceTs, {
    setZone: true,
  }).setZone(params.timeZone);
  if (!reference.isValid) {
    return unresolved(params.weekday, params.weekOffset, 'referenceTs is invalid');
  }

  const targetWeekday = toLuxonWeekday(params.weekday);
  if (targetWeekday == null) {
    return unresolved(
      params.weekday,
      params.weekOffset,
      'weekday is unsupported',
    );
  }

  const startOfWeek = reference.startOf('week');
  const start = startOfWeek
    .plus({
      weeks: params.weekOffset,
      days: targetWeekday - 1,
    })
    .startOf('day');

  return dayResolution(
    params.weekday,
    params.weekOffset,
    start,
    'resolved from weekday + weekOffset',
  );
}

function dayResolution(
  weekday: ResolveRelativeDateToolParameters['weekday'],
  weekOffset: number,
  start: DateTime,
  note: string,
): ResolvedRelativeDateResult {
  return {
    resolved: true,
    weekday,
    weekOffset,
    granularity: 'day',
    startAt: toIsoOrThrow(start),
    endAt: toIsoOrThrow(start.plus({ days: 1 })),
    note,
  };
}

function unresolved(
  weekday: ResolveRelativeDateToolParameters['weekday'],
  weekOffset: number,
  note: string,
): ResolvedRelativeDateResult {
  return {
    resolved: false,
    weekday,
    weekOffset,
    granularity: null,
    startAt: null,
    endAt: null,
    note,
  };
}

function toLuxonWeekday(
  weekday: ResolveRelativeDateToolParameters['weekday'],
): number | null {
  const byName: Record<ResolveRelativeDateToolParameters['weekday'], number> = {
    MO: 1,
    TU: 2,
    WE: 3,
    TH: 4,
    FR: 5,
    SA: 6,
    SU: 7,
  };
  return byName[weekday] ?? null;
}

function toIsoOrThrow(dateTime: DateTime): string {
  const iso = dateTime.toISO({
    includeOffset: true,
    suppressMilliseconds: true,
  });
  if (iso == null) {
    throw new Error('Expected valid ISO timestamp');
  }
  return iso;
}
