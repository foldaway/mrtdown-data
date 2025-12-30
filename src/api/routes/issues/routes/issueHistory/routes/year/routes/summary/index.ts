import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { zValidator } from '@hono/zod-validator';
import { ParamSchema } from './schema/param.js';
import {
  SummaryResponseSchema,
  type SummaryResponse,
} from './schema/response.js';
import { issueHistoryYearSummaryQuery } from './queries/issueHistoryYearSummary.js';

export const issueHistoryYearSummaryRoute = new Hono();

issueHistoryYearSummaryRoute.get(
  '/',
  zValidator('param', ParamSchema),
  describeRoute({
    description: 'Get issue count summary by type for each month in the year',
    responses: {
      200: {
        description: 'Issue count summary by type for each month in the year',
        content: {
          'application/json': {
            schema: resolver(SummaryResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    const { year } = c.req.valid('param');

    const rows = await issueHistoryYearSummaryQuery(year);

    const summaryByMonth = rows.map((row) => ({
      month: row.month,
      issueCountsByType: {
        disruption: row.disruption_count,
        maintenance: row.maintenance_count,
        infra: row.infra_count,
      },
      totalCount: row.total_count,
    }));

    return c.json({
      success: true,
      data: {
        startAt: `${year}-01-01`,
        endAt: `${year}-12-31`,
        summaryByMonth,
      },
      included: {
        lines: {},
        stations: {},
        issues: {},
        landmarks: {},
        towns: {},
        operators: {},
      },
    } satisfies SummaryResponse);
  },
);
