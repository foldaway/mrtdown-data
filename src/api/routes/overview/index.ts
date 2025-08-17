import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import type { LineSummary } from '../../schema/LineSummary.js';
import { IncludedEntitiesCollector } from '../../utils/IncludedEntitiesCollector.js';
import { issueIdsActiveNowQuery } from './queries/issueIdsActiveNow.js';
import type { Response } from './schema/response.js';
import { ResponseSchema } from './schema/response.js';
import { lineSummariesQuery } from './queries/lineSummaries.js';
import { issueIdsActiveTodayQuery } from './queries/issueIdsActiveToday.js';
import { DateTime } from 'luxon';
import { assert } from '../../../util/assert.js';
import { QuerySchema } from './schema/query.js';

export const overviewRoute = new Hono();
overviewRoute.get(
  '/',
  describeRoute({
    description: 'Overview endpoint',
    responses: {
      200: {
        description: 'Successful overview response',
        content: {
          'application/json': {
            schema: resolver(ResponseSchema),
          },
        },
      },
    },
  }),
  validator('query', QuerySchema),
  async (c) => {
    const query = c.req.valid('query');

    const entitiesCollector = new IncludedEntitiesCollector();

    // Active issues now
    const issueIdsActiveNowRows = await issueIdsActiveNowQuery();
    const issueIdsActiveNow = issueIdsActiveNowRows.map((row) => row.issue_id);
    entitiesCollector.addIssueIds(issueIdsActiveNow);

    // Active issues today
    const issueIdsActiveTodayRows = await issueIdsActiveTodayQuery();
    const issueIdsActiveToday = issueIdsActiveTodayRows.map(
      (row) => row.issue_id,
    );
    entitiesCollector.addIssueIds(issueIdsActiveToday);

    // Line summaries
    const lineSummaries: LineSummary[] = [];
    const lineSummaryRows = await lineSummariesQuery(query.days ?? 30);
    for (const row of lineSummaryRows) {
      const lineSummary: LineSummary = {
        lineId: row.component_id,
        status: row.component_status,
        durationSecondsByIssueType: {},
        durationSecondsTotalForIssues: 0,
        breakdownByDates: {},
        uptimeRatio: row.uptime_ratio,
        totalServiceSeconds: row.total_service_seconds,
        totalDowntimeSeconds: row.total_downtime_seconds,
        downtimeBreakdown: null,
      };

      entitiesCollector.addIssueId(row.component_id);

      for (const dailyStat of row.daily_issue_stats) {
        if (dailyStat.day == null) {
          // This case is possible for components that are not in service
          continue;
        }

        entitiesCollector.addIssueIds(dailyStat.issueIds);

        const dateTime = DateTime.fromSQL(dailyStat.day);
        assert(dateTime.isValid, `Invalid date: ${dailyStat.day}`);

        const dateString = dateTime.toISODate();
        assert(dateString != null, `Invalid date string: ${dailyStat.day}`);

        lineSummary.breakdownByDates[dateString] ??= {
          breakdownByIssueTypes: {},
          dayType: dailyStat.day_type,
        };

        if (dailyStat.type === 'none') {
          // This means there were no issues affecting this component on this day
          // We can skip this entry
          continue;
        }

        lineSummary.durationSecondsByIssueType[dailyStat.type] =
          (lineSummary.durationSecondsByIssueType[dailyStat.type] ?? 0) +
          dailyStat.total_duration_seconds;

        lineSummary.durationSecondsTotalForIssues +=
          dailyStat.total_duration_seconds;

        lineSummary.breakdownByDates[dateString].breakdownByIssueTypes[
          dailyStat.type
        ] = {
          totalDurationSeconds: dailyStat.total_duration_seconds,
          issueIds: dailyStat.issueIds,
        };
      }

      for (const breakdown of row.downtime_breakdown ?? []) {
        if (breakdown.type == null) {
          // Possible case when 100% uptime is reported
          continue;
        }
        lineSummary.downtimeBreakdown ??= [];
        lineSummary.downtimeBreakdown.push({
          type: breakdown.type,
          downtimeSeconds: breakdown.downtime_seconds,
        });
      }

      lineSummaries.push(lineSummary);
    }

    const included = await entitiesCollector.fetchIncludedEntities();

    const response: Response = {
      success: true,
      data: {
        lineSummaries,
        issueIdsActiveNow,
        issueIdsActiveToday,
      },
      included,
    };

    return c.json(response);
  },
);
