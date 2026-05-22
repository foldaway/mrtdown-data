import type { IssueBundle, Period, ServiceScope } from '@mrtdown/core';
import type { MRTDownRepository } from '@mrtdown/fs';
import { DateTime, Interval } from 'luxon';
import type { Table } from 'mdast';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { toMarkdown } from 'mdast-util-to-markdown';
import z from 'zod';
import { deriveCurrentState } from '../../../../helpers/deriveCurrentState.js';
import { Tool } from '../../../common/tool.js';

const FindIssuesByDateRangeToolParametersSchema = z.object({
  startAt: z
    .string()
    .describe('Inclusive start of the search window as ISO date or datetime.'),
  endAt: z
    .string()
    .describe('Inclusive end of the search window as ISO date or datetime.'),
});
type FindIssuesByDateRangeToolParameters = z.infer<
  typeof FindIssuesByDateRangeToolParametersSchema
>;

const MAX_RESULTS = 25;

type IssueDateRangeMatch = {
  issue: IssueBundle;
  score: number;
  reasons: string[];
};

export class FindIssuesByDateRangeTool extends Tool<FindIssuesByDateRangeToolParameters> {
  public name = 'findIssuesByDateRange';
  public description =
    'Find issues whose issue date, evidence timestamps, or impact periods overlap a date range';
  private readonly repo: MRTDownRepository;

  constructor(repo: MRTDownRepository) {
    super();
    this.repo = repo;
  }

  public get paramsSchema(): { [key: string]: unknown } {
    return z.toJSONSchema(FindIssuesByDateRangeToolParametersSchema);
  }

  public parseParams(params: unknown): FindIssuesByDateRangeToolParameters {
    return FindIssuesByDateRangeToolParametersSchema.parse(params);
  }

  public async runner(
    params: FindIssuesByDateRangeToolParameters,
  ): Promise<string> {
    console.log(
      '[findIssuesByDateRange] Calling tool with parameters:',
      params,
    );

    const searchWindow = parseSearchWindow(params);
    const matches = this.repo.issues
      .list()
      .map((issue) => getIssueDateRangeMatch(issue, searchWindow))
      .filter((match): match is IssueDateRangeMatch => match != null)
      .sort(
        (a, b) =>
          b.score - a.score || b.issue.issue.id.localeCompare(a.issue.issue.id),
      )
      .slice(0, MAX_RESULTS);

    if (matches.length === 0) {
      return 'No issues found in date range.';
    }

    const issueTable: Table = {
      type: 'table',
      children: [
        {
          type: 'tableRow',
          children: [
            tableCell('Issue ID'),
            tableCell('Issue Title'),
            tableCell('Issue Date'),
            tableCell('Match'),
            tableCell('Matching Evidence'),
            tableCell('Current Scope'),
          ],
        },
      ],
    };

    for (const match of matches) {
      issueTable.children.push({
        type: 'tableRow',
        children: [
          tableCell(match.issue.issue.id),
          tableCell(match.issue.issue.title['en-SG']),
          tableCell(match.issue.issue.id.slice(0, 10)),
          tableCell(match.reasons.join(', ')),
          tableCell(formatMatchingEvidence(match.issue, searchWindow)),
          tableCell(formatCurrentScope(match.issue)),
        ],
      });
    }

    const output = toMarkdown(issueTable, {
      extensions: [gfmToMarkdown()],
    });
    console.log(`[findIssuesByDateRange] Response output:\n${output}`);

    return output;
  }
}

function parseSearchWindow(params: FindIssuesByDateRangeToolParameters) {
  const start = parseBoundary(params.startAt, 'start');
  const end = parseBoundary(params.endAt, 'end');

  if (end < start) {
    throw new Error(
      `Invalid date range: ${params.startAt} after ${params.endAt}`,
    );
  }

  return inclusiveInterval(start, end);
}

function parseBoundary(value: string, boundary: 'start' | 'end'): DateTime {
  const parsed = DateTime.fromISO(value, {
    setZone: true,
    zone: 'Asia/Singapore',
  }).setZone('Asia/Singapore');

  if (!parsed.isValid) {
    throw new Error(`Invalid ISO date or datetime: ${value}`);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return boundary === 'start' ? parsed.startOf('day') : parsed.endOf('day');
  }

  return parsed;
}

function getIssueDateRangeMatch(
  bundle: IssueBundle,
  window: Interval,
): IssueDateRangeMatch | null {
  let score = 0;
  const reasons: string[] = [];

  if (issueDateOverlapsWindow(bundle.issue.id, window)) {
    score += 5;
    reasons.push('issue date');
  }

  const evidenceMatches = bundle.evidence.filter((evidence) =>
    dateTimeOverlapsWindow(
      DateTime.fromISO(evidence.ts, { setZone: true }),
      window,
    ),
  );
  if (evidenceMatches.length > 0) {
    score += Math.min(evidenceMatches.length, 3) * 3;
    reasons.push('evidence timestamp');
  }

  const periodMatches = bundle.impactEvents
    .filter((event) => event.type === 'periods.set')
    .flatMap((event) => event.periods)
    .filter((period) => periodOverlapsWindow(period, window));
  if (periodMatches.length > 0) {
    score += Math.min(periodMatches.length, 3);
    reasons.push('active period');
  }

  return score > 0 ? { issue: bundle, score, reasons } : null;
}

function issueDateOverlapsWindow(issueId: string, window: Interval): boolean {
  const issueDate = DateTime.fromISO(issueId.slice(0, 10), {
    zone: 'Asia/Singapore',
  });
  if (!issueDate.isValid) {
    return false;
  }

  return window.overlaps(
    inclusiveInterval(issueDate.startOf('day'), issueDate.endOf('day')),
  );
}

function periodOverlapsWindow(period: Period, window: Interval): boolean {
  const start = DateTime.fromISO(period.startAt, { setZone: true });
  const end = DateTime.fromISO(period.endAt ?? window.end?.toISO() ?? '', {
    setZone: true,
  });

  if (!start.isValid || !end.isValid) {
    return false;
  }

  return window.overlaps(inclusiveInterval(start, end));
}

function dateTimeOverlapsWindow(dateTime: DateTime, window: Interval): boolean {
  return dateTime.isValid && window.contains(dateTime);
}

function inclusiveInterval(start: DateTime, end: DateTime): Interval {
  return Interval.fromDateTimes(start, end.plus({ milliseconds: 1 }));
}

function formatMatchingEvidence(bundle: IssueBundle, window: Interval): string {
  const matchingEvidence = bundle.evidence
    .filter((evidence) =>
      dateTimeOverlapsWindow(
        DateTime.fromISO(evidence.ts, { setZone: true }),
        window,
      ),
    )
    .slice(0, 2)
    .map((evidence) => `${evidence.ts}: ${truncate(evidence.text, 120)}`);

  return matchingEvidence.length > 0 ? matchingEvidence.join('\n') : 'none';
}

function formatCurrentScope(bundle: IssueBundle): string {
  const state = deriveCurrentState(bundle);
  const services = Object.values(state.services).map((service) => {
    const scopes =
      service.scopes.length > 0
        ? service.scopes.map(formatScope).join(', ')
        : 'scope unknown';
    const periods =
      service.periods.length > 0
        ? service.periods.map(formatPeriod).join(', ')
        : 'period unknown';
    const causes =
      service.causes.length > 0 ? ` causes=${service.causes.join(',')}` : '';
    return `${service.serviceId} ${service.effect?.kind ?? 'effect unknown'} ${scopes} ${periods}${causes}`;
  });

  if (services.length > 0) {
    return services.slice(0, 3).join('\n');
  }

  const facilities = Object.values(state.facilities).map(
    (facility) =>
      `${facility.stationId} ${facility.lineId ?? 'line unknown'} ${facility.kind} ${facility.effect?.kind ?? 'effect unknown'}`,
  );

  return facilities.length > 0 ? facilities.slice(0, 3).join('\n') : 'none';
}

function formatScope(scope: ServiceScope): string {
  switch (scope.type) {
    case 'service.whole':
      return 'whole service';
    case 'service.segment':
      return `${scope.fromStationId}-${scope.toStationId}`;
    case 'service.point':
      return scope.stationId;
  }
}

function formatPeriod(period: Period): string {
  switch (period.kind) {
    case 'fixed':
      return `${period.startAt} to ${period.endAt ?? 'ongoing'}`;
    case 'recurring':
      return `${period.startAt} to ${period.endAt} recurring ${period.frequency}`;
  }
}

function tableCell(value: string) {
  return {
    type: 'tableCell' as const,
    children: [{ type: 'text' as const, value }],
  };
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 3)}...`;
}
