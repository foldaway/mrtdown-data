import { Hono } from 'hono';
import type { Response } from './schema/response.js';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { DateTime } from 'luxon';
import { assert } from '../../../../../util/assert.js';
import { IncludedEntitiesCollector } from '../../../../utils/IncludedEntitiesCollector.js';
import type { LineBranch } from '../../../../schema/LineBranch.js';
import type { LineProfile } from '../../../../schema/LineProfile.js';
import type { LineSummary } from '../../../../schema/LineSummary.js';
import { lineBranchesQuery } from './queries/lineBranches.js';
import { lineSummaryQuery } from './queries/lineSummary.js';
import { issueIdsRecentQuery } from './queries/issueIdsRecent.js';
import { issueNextMaintenanceIdQuery } from './queries/issueNextMaintenanceId.js';
import { CHART_CONFIGS } from '../../../../constants.js';
import { issueCountsQuery } from './queries/issueCounts.js';
import type { ChartEntry, TimeScaleChart } from '../../../../schema/Chart.js';
import { uptimeRatiosQuery } from './queries/uptimeRatios.js';
import { issueCountByTypeQuery } from './queries/issueCountByType.js';
import { QuerySchema } from './schema/query.js';
import { ParamSchema } from './schema/param.js';
import { ResponseSchema } from './schema/response.js';
import { stationIdsInterchangesQuery } from './queries/stationIdsInterchanges.js';
import { issueCountsCumulativeQuery } from './queries/issueCountsCumulative.js';
import { uptimeRatiosCumulativeQuery } from './queries/uptimeRatiosCumulative.js';

export const lineProfileRoute = new Hono();
lineProfileRoute.get(
  '/',
  describeRoute({
    description: 'Get the profile of a line',
    responses: {
      200: {
        description: 'Successful line profile response',
        content: {
          'application/json': {
            schema: resolver(ResponseSchema),
          },
        },
      },
      404: {
        description: 'Line not found',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                error: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }),
  validator('param', ParamSchema),
  validator('query', QuerySchema),
  async (c) => {
    const { lineId } = c.req.valid('param');
    const { days } = c.req.valid('query');

    // Initialize the entities collector
    const entitiesCollector = new IncludedEntitiesCollector();
    entitiesCollector.addLineId(lineId);

    const lineSummaryQueryRows = await lineSummaryQuery(lineId, days ?? 90);
    if (lineSummaryQueryRows.length === 0) {
      return c.json({ success: false, error: 'Line not found' }, 404);
    }

    const [lineSummaryRow] = lineSummaryQueryRows;

    const lineSummary: LineSummary = {
      lineId,
      status: lineSummaryRow.component_status,
      durationSecondsByIssueType: {},
      durationSecondsTotalForIssues: 0,
      breakdownByDates: {},
      uptimeRatio: lineSummaryRow.uptime_ratio,
      totalServiceSeconds: lineSummaryRow.total_service_seconds,
      totalDowntimeSeconds: lineSummaryRow.total_downtime_seconds,
      downtimeBreakdown: null,
    };

    for (const dailyStat of lineSummaryRow.daily_issue_stats) {
      if (dailyStat.day == null) {
        // This case is possible for components that are not in service
        continue;
      }

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
        issueIds: dailyStat.issue_ids,
      };

      // Collect issue IDs for inclusion
      entitiesCollector.addIssueIds(dailyStat.issue_ids);
    }

    const lineBranchesQueryRows = await lineBranchesQuery(lineId);
    const branches: LineBranch[] = [];
    for (const row of lineBranchesQueryRows) {
      let startedAt: string | null = null;
      if (row.started_at != null) {
        const branchStartedAt = DateTime.fromSQL(row.started_at);
        assert(
          branchStartedAt.isValid,
          `Invalid started_at: ${row.started_at}`,
        );
        startedAt = branchStartedAt.toISO();
      }

      let endedAt: string | null = null;
      if (row.ended_at != null) {
        endedAt = DateTime.fromSQL(row.ended_at).toISO();
        assert(endedAt != null, `Invalid ended_at: ${row.ended_at}`);
      }

      const branch: LineBranch = {
        id: row.id,
        title: row.title,
        titleTranslations: JSON.parse(row.title_translations),
        startedAt,
        endedAt,
        stationIds: row.stationIds,
      };

      // Collect station IDs for inclusion
      entitiesCollector.addStationIds(row.stationIds);

      branches.push(branch);
    }

    // Recent Issues
    const issueIdsRecent: string[] = [];
    const issueIdsRecentQueryRows = await issueIdsRecentQuery(lineId);
    for (const row of issueIdsRecentQueryRows) {
      issueIdsRecent.push(row.issue_id);
      entitiesCollector.addIssueId(row.issue_id);
    }

    // Next Maintenance Issue
    let issueIdNextMaintenance: string | null = null;
    const issueNextMaintenanceIdQueryRows =
      await issueNextMaintenanceIdQuery(lineId);
    if (issueNextMaintenanceIdQueryRows.length > 0) {
      const [row] = issueNextMaintenanceIdQueryRows;
      issueIdNextMaintenance = row.issue_id;
      entitiesCollector.addIssueId(issueIdNextMaintenance);
    }

    // Issue Counts Graphs
    const timeScaleGraphsIssueCount: TimeScaleChart[] = [];

    for (const config of CHART_CONFIGS) {
      const { displayTimeScale, dataTimeScale } = config;

      const issueCountRows = await issueCountsQuery(
        lineId,
        dataTimeScale.granularity,
        dataTimeScale.count,
      );

      const title = new Intl.NumberFormat(undefined, {
        style: 'unit',
        unit: displayTimeScale?.granularity ?? dataTimeScale.granularity,
      }).format(displayTimeScale?.count ?? dataTimeScale.count);

      const issueCountsCumulativeRows = await issueCountsCumulativeQuery(
        lineId,
        dataTimeScale.granularity,
        dataTimeScale.count,
      );

      const graphIssueCount: TimeScaleChart = {
        title,
        displayTimeScale,
        dataTimeScale,
        data: issueCountRows.map((row) => {
          const name = DateTime.fromSQL(row.bucket, {
            zone: 'Asia/Singapore',
          }).toISODate();
          assert(name != null);

          const entry: ChartEntry = {
            name,
            payload: {},
          };

          for (const item of row.issue_counts) {
            entry.payload[item.key] = item.value;
          }

          return entry;
        }),
        dataCumulative: issueCountsCumulativeRows.map((row) => {
          const chartEntry: ChartEntry = {
            name: row.period,
            payload: {},
          };

          for (const breakdown of row.breakdown) {
            chartEntry.payload[`count.${breakdown.key}`] =
              breakdown.value.issue_count;
            chartEntry.payload[`duration.${breakdown.key}`] =
              breakdown.value.total_duration_seconds;
          }

          return chartEntry;
        }),
      };

      timeScaleGraphsIssueCount.push(graphIssueCount);
    }

    // Issue Uptime Ratios Graphs
    const timeScaleGraphsUptimeRatios: TimeScaleChart[] = [];
    for (const config of CHART_CONFIGS) {
      const { displayTimeScale, dataTimeScale } = config;

      const uptimeRatioRows = await uptimeRatiosQuery(
        lineId,
        dataTimeScale.granularity,
        dataTimeScale.count,
      );

      const uptimeRatioCumulativeRows = await uptimeRatiosCumulativeQuery(
        lineId,
        dataTimeScale.granularity,
        dataTimeScale.count,
      );

      const graphUptimeRatio: TimeScaleChart = {
        title: `Uptime Ratio (${displayTimeScale?.granularity ?? dataTimeScale.granularity})`,
        displayTimeScale,
        dataTimeScale,
        data: uptimeRatioRows.map((row) => {
          const name = DateTime.fromSQL(row.bucket, {
            zone: 'Asia/Singapore',
          }).toISODate();
          assert(name != null);
          const entry: ChartEntry = {
            name,
            payload: {
              uptimeRatio: row.uptime_ratio,
              totalServiceSeconds: row.total_service_seconds,
              totalDowntimeSeconds: row.total_downtime_seconds,
            },
          };

          for (const item of row.downtime_breakdown) {
            entry.payload[`breakdown.${item.type}`] = item.downtime_seconds;
          }

          return entry;
        }),
        dataCumulative: uptimeRatioCumulativeRows.map((row) => {
          const entry: ChartEntry = {
            name: row.period,
            payload: {
              uptimeRatio: row.uptime_ratio,
              totalServiceSeconds: row.total_service_seconds,
              totalDowntimeSeconds: row.total_downtime_seconds,
            },
          };

          return entry;
        }),
      };

      timeScaleGraphsUptimeRatios.push(graphUptimeRatio);
    }

    // Issue Count by Type
    const issueCountByType: Record<string, number> = {};
    const issueCountByTypeRows = await issueCountByTypeQuery(lineId);
    for (const row of issueCountByTypeRows) {
      issueCountByType[row.type] = row.count;
    }

    // Station Interchanges
    const stationIdsInterchanges: string[] = [];
    const stationIdsInterchangesRows =
      await stationIdsInterchangesQuery(lineId);
    for (const row of stationIdsInterchangesRows) {
      stationIdsInterchanges.push(row.id);
      entitiesCollector.addStationId(row.id);
    }

    const lineProfile: LineProfile = {
      lineId,
      branches,
      issueIdsRecent,
      issueIdNextMaintenance,
      issueCountByType,
      timeScaleGraphsIssueCount,
      timeScaleGraphsUptimeRatios,
      stationIdsInterchanges,
      lineSummary,
    };

    // Fetch all included entities with cascading relationships
    const included = await entitiesCollector.fetchIncludedEntities();

    return c.json({
      success: true,
      data: lineProfile,
      included,
    } satisfies Response);
  },
);
