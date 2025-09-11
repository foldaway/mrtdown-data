import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { ResponseSchema, type Response } from './schema/response.js';
import type { SystemAnalytics } from '../../schema/SystemAnalytics.js';
import { DateTime } from 'luxon';
import { assert } from '../../../util/assert.js';
import { issueCounts } from './queries/issueCounts.js';
import { CHART_CONFIGS } from '../../constants.js';
import { totalIssueCountsByLineQuery } from './queries/totalIssueCountsByLine.js';
import { issueIdsDisruptionLongestQuery } from './queries/issueIdsDisruptionLongest.js';
import { issueCountByStation } from './queries/issueCountByStation.js';
import type { ChartEntry, TimeScaleChart } from '../../schema/Chart.js';
import { IncludedEntitiesCollector } from '../../utils/IncludedEntitiesCollector.js';
import { issueCountsCumulativeQuery } from './queries/issueCountsCumulative.js';

export const analyticsRoute = new Hono();

analyticsRoute.get(
  '/',
  describeRoute({
    description: 'Get an overview of the analytics data.',
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
  async (c) => {
    const entitiesCollector = new IncludedEntitiesCollector();

    const statistics: SystemAnalytics = {
      timeScaleChartsIssueCount: [],
      timeScaleChartsIssueDuration: [],
      chartTotalIssueCountByLine: {
        title: 'Total Issue Count by Component',
        data: [],
      },
      chartTotalIssueCountByStation: {
        title: 'Total Issue Count By Station',
        data: [],
      },
      issueIdsDisruptionLongest: [],
    };

    // Fetch issue counts for different time scales and types

    for (const config of CHART_CONFIGS) {
      const { displayTimeScale, dataTimeScale } = config;

      const issueCountRows = await issueCounts(
        dataTimeScale.granularity,
        dataTimeScale.count,
      );

      const issueCountCumulativeRows = await issueCountsCumulativeQuery(
        dataTimeScale.granularity,
        dataTimeScale.count,
      );

      const title = new Intl.NumberFormat(undefined, {
        style: 'unit',
        unit: displayTimeScale?.granularity ?? dataTimeScale.granularity,
      }).format(displayTimeScale?.count ?? dataTimeScale.count);

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
        dataCumulative: issueCountCumulativeRows.map((row) => {
          const chartEntry: ChartEntry = {
            name: row.period,
            payload: {},
          };

          for (const breakdown of row.breakdown) {
            chartEntry.payload[breakdown.key] = breakdown.value.issue_count;
          }

          return chartEntry;
        }),
      };
      const graphIssueDisruption: TimeScaleChart = {
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

          for (const item of row.total_duration_seconds) {
            entry.payload[item.key] = item.value;
          }
          return entry;
        }),
        dataCumulative: issueCountCumulativeRows.map((row) => {
          const chartEntry: ChartEntry = {
            name: row.period,
            payload: {},
          };

          for (const breakdown of row.breakdown) {
            chartEntry.payload[breakdown.key] =
              breakdown.value.total_duration_seconds;
          }

          return chartEntry;
        }),
      };

      statistics.timeScaleChartsIssueCount.push(graphIssueCount);
      statistics.timeScaleChartsIssueDuration.push(graphIssueDisruption);
    }

    // Total issue counts by line

    const totalIssueCountRows = await totalIssueCountsByLineQuery();

    const graphTotalIssueCountByComponentId: Record<string, ChartEntry> = {};

    for (const row of totalIssueCountRows) {
      const entry: ChartEntry = graphTotalIssueCountByComponentId[
        row.component_id
      ] ?? {
        name: row.component_id,
        payload: {
          component_id: row.component_id,
          component_color: row.component_color,
          component_title: row.component_title,
          component_title_translations: JSON.parse(
            row.component_title_translations,
          ),
          disruption: 0,
          infra: 0,
          maintenance: 0,
          totalIssues: 0,
        },
      };

      entry.payload[row.issue_type] = row.issue_count;
      entry.payload.totalIssues += row.issue_count;
      graphTotalIssueCountByComponentId[row.component_id] = entry;
      entitiesCollector.addLineId(row.component_id);
    }

    statistics.chartTotalIssueCountByLine.data = Object.values(
      graphTotalIssueCountByComponentId,
    );

    // Longest disruptions

    const issueIdsDisruptionLongestRows =
      await issueIdsDisruptionLongestQuery();
    statistics.issueIdsDisruptionLongest = issueIdsDisruptionLongestRows.map(
      (row) => row.issue_id,
    );
    entitiesCollector.addIssueIds(statistics.issueIdsDisruptionLongest);

    // Total issue count by station

    const issueCountByStationRows = await issueCountByStation();
    for (const row of issueCountByStationRows) {
      entitiesCollector.addStationId(row.station_id);

      const chartEntry: ChartEntry = {
        name: row.station_id,
        payload: {
          totalIssues: row.total_issues,
        },
      };

      for (const issueTypeDetail of row.issues_by_type) {
        chartEntry.payload[issueTypeDetail.type] = issueTypeDetail.count;
      }

      statistics.chartTotalIssueCountByStation.data.push(chartEntry);
    }

    const included = await entitiesCollector.fetchIncludedEntities();

    return c.json({
      success: true,
      data: statistics,
      included,
    } satisfies Response);
  },
);
