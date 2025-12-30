import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { DateTime } from 'luxon';
import { assert } from '../../../../../util/assert.js';
import { ResponseSchema, type Response } from './schema/response.js';
import { ParamSchema } from './schema/param.js';
import { QuerySchema } from './schema/query.js';
import { IncludedEntitiesCollector } from '../../../../utils/IncludedEntitiesCollector.js';
import { operatorProfileQuery } from './queries/operatorProfile.js';
import { operatorSummaryQuery } from './queries/operatorSummary.js';
import { operatorIssueCountByTypeQuery } from './queries/operatorIssueCountByType.js';
import { operatorIssueIdsRecentQuery } from './queries/operatorIssueIdsRecent.js';
import { operatorIssueCountsQuery } from './queries/operatorIssueCounts.js';
import { operatorUptimeRatiosQuery } from './queries/operatorUptimeRatios.js';
import { operatorTotalStationsQuery } from './queries/operatorTotalStations.js';
import { operatorLinePerformanceQuery } from './queries/operatorLinePerformance.js';
import { operatorIssueCountsCumulativeQuery } from './queries/operatorIssueCountsCumulative.js';
import { operatorUptimeRatiosCumulativeQuery } from './queries/operatorUptimeRatiosCumulative.js';
import { CHART_CONFIGS } from '../../../../constants.js';
import type { ChartEntry, TimeScaleChart } from '../../../../schema/Chart.js';
import type { OperatorProfile } from '../../../../schema/OperatorProfile.js';
import { OperatorModel } from '../../../../../model/OperatorModel.js';

export const operatorProfileRoute = new Hono();

operatorProfileRoute.get(
  '/',
  describeRoute({
    description: 'Get the profile of an operator',
    responses: {
      200: {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: resolver(ResponseSchema),
          },
        },
      },
      404: {
        description: 'Operator not found',
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
    const param = c.req.valid('param');
    const { operatorId } = param;
    const { days } = c.req.valid('query');

    const entitiesCollector = new IncludedEntitiesCollector();

    // Check if operator exists
    const rows = await operatorProfileQuery(operatorId);
    if (rows.length === 0) {
      return c.json(
        {
          success: false,
          error: 'Operator not found',
        },
        404,
      );
    }

    const [row] = rows;
    const lineIds = row.line_ids;
    entitiesCollector.addOperatorId(operatorId);
    entitiesCollector.addLineIds(lineIds);

    const daysToUse = days ?? 90;

    // Priority 1 - Critical Performance Metrics
    const summaryRows = await operatorSummaryQuery(operatorId, daysToUse);
    const summaryRow = summaryRows.length > 0 ? summaryRows[0] : null;

    // Get issue counts by type
    const issueCountByTypeRows = await operatorIssueCountByTypeQuery(
      operatorId,
      daysToUse,
    );
    const totalIssuesByType: Record<string, number> = {};
    for (const issueRow of issueCountByTypeRows) {
      totalIssuesByType[issueRow.type] = issueRow.count;
    }

    // Get line performance for current operational status
    const linePerformanceRows = await operatorLinePerformanceQuery(
      operatorId,
      daysToUse,
    );
    const linePerformanceComparison = linePerformanceRows.map((lp) => ({
      lineId: lp.line_id,
      status: lp.status,
      uptimeRatio: lp.uptime_ratio,
      issueCount: lp.issue_count,
    }));

    // Determine current operational status
    const linesWithDisruptions = linePerformanceRows.filter(
      (lp) => lp.status === 'ongoing_disruption',
    );
    const linesWithMaintenance = linePerformanceRows.filter(
      (lp) => lp.status === 'ongoing_maintenance',
    );
    const linesAffected: string[] = [];
    let currentOperationalStatus:
      | 'all_operational'
      | 'some_lines_disrupted'
      | 'some_lines_under_maintenance';

    if (linesWithDisruptions.length > 0) {
      currentOperationalStatus = 'some_lines_disrupted';
      linesAffected.push(...linesWithDisruptions.map((lp) => lp.line_id));
    } else if (linesWithMaintenance.length > 0) {
      currentOperationalStatus = 'some_lines_under_maintenance';
      linesAffected.push(...linesWithMaintenance.map((lp) => lp.line_id));
    } else {
      currentOperationalStatus = 'all_operational';
    }

    // Priority 2 - Network Scale & Context
    const totalStationsRows = await operatorTotalStationsQuery(operatorId);
    const totalStationsOperated =
      totalStationsRows.length > 0 ? totalStationsRows[0].total_stations : 0;

    const recentIssueRows = await operatorIssueIdsRecentQuery(operatorId, 15);
    const issueIdsRecent = recentIssueRows.map((r) => r.issue_id);
    entitiesCollector.addIssueIds(issueIdsRecent);

    // Priority 3 - Trend Analysis
    const timeScaleGraphsIssueCount: TimeScaleChart[] = [];
    for (const config of CHART_CONFIGS) {
      const { displayTimeScale, dataTimeScale } = config;

      const issueCountRows = await operatorIssueCountsQuery(
        operatorId,
        dataTimeScale.granularity,
        dataTimeScale.count,
      );

      const title = new Intl.NumberFormat(undefined, {
        style: 'unit',
        unit: displayTimeScale?.granularity ?? dataTimeScale.granularity,
      }).format(displayTimeScale?.count ?? dataTimeScale.count);

      const issueCountsCumulativeRows =
        await operatorIssueCountsCumulativeQuery(
          operatorId,
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

    const timeScaleGraphsUptimeRatios: TimeScaleChart[] = [];
    for (const config of CHART_CONFIGS) {
      const { displayTimeScale, dataTimeScale } = config;

      const uptimeRatioRows = await operatorUptimeRatiosQuery(
        operatorId,
        dataTimeScale.granularity,
        dataTimeScale.count,
      );

      const uptimeRatioCumulativeRows =
        await operatorUptimeRatiosCumulativeQuery(
          operatorId,
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

    // Priority 5 - Historical Context
    const totalDowntimeDurationSeconds =
      summaryRow?.total_downtime_seconds ?? 0;
    const downtimeDurationByIssueType: Record<string, number> = {};
    if (summaryRow?.downtime_breakdown) {
      for (const breakdown of summaryRow.downtime_breakdown) {
        if (breakdown.type) {
          downtimeDurationByIssueType[breakdown.type] =
            (downtimeDurationByIssueType[breakdown.type] ?? 0) +
            breakdown.downtime_seconds;
        }
      }
    }

    // Calculate years of operation
    const operators = OperatorModel.getAll();
    const operator = operators.find((op) => op.id === operatorId);
    let yearsOfOperation: number | null = null;
    if (operator?.foundedAt) {
      const foundedDate = DateTime.fromISO(operator.foundedAt);
      if (foundedDate.isValid) {
        const now = DateTime.now();
        yearsOfOperation = Math.floor(now.diff(foundedDate, 'years').years);
      }
    }

    const operatorProfile: OperatorProfile = {
      operatorId,
      lineIds,
      aggregateUptimeRatio: summaryRow?.uptime_ratio ?? null,
      currentOperationalStatus,
      linesAffected,
      totalIssuesByType,
      totalStationsOperated,
      issueIdsRecent,
      timeScaleGraphsIssueCount,
      timeScaleGraphsUptimeRatios,
      linePerformanceComparison,
      totalDowntimeDurationSeconds,
      downtimeDurationByIssueType,
      yearsOfOperation,
    };

    const included = await entitiesCollector.fetchIncludedEntities();

    const response: Response = {
      success: true,
      data: operatorProfile,
      included,
    };

    return c.json(response);
  },
);
