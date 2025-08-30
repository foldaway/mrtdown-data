import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { zValidator } from '@hono/zod-validator';
import { ParamSchema } from './schema/param.js';
import { ResponseSchema, type Response } from './schema/response.js';
import { issueHistoryYearQuery } from './queries/issueHistoryYear.js';
import { DateTime } from 'luxon';
import { IncludedEntitiesCollector } from '../../../../../../utils/IncludedEntitiesCollector.js';
import { assert } from '../../../../../../../util/assert.js';
import { issueHistoryMonthRoute } from './routes/month/index.js';
import { issueHistoryYearSummaryRoute } from './routes/summary/index.js';

export const issueHistoryYearRoute = new Hono();

issueHistoryYearRoute.get(
  '/',
  zValidator('param', ParamSchema),
  describeRoute({
    description: 'Get issues for a specific year',
    responses: {
      200: {
        description: 'Issues for the specified year',
        content: {
          'application/json': {
            schema: resolver(ResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    const { year } = c.req.valid('param');
    const entitiesCollector = new IncludedEntitiesCollector();

    const startDate = DateTime.fromISO(`${year}-01-01`, {
      zone: 'Asia/Singapore',
    });
    const endDate = startDate.plus({ years: 1 });

    const rows = await issueHistoryYearQuery(year);

    const issuesByMonth = rows.map(row => ({
      month: row.month,
      issueIds: row.issue_ids,
    }));

    const allIssueIds = rows.flatMap(row => row.issue_ids);
    entitiesCollector.addIssueIds(allIssueIds);

    const startAt = startDate.toISODate();
    assert(startAt != null);
    const endAt = endDate.toISODate();
    assert(endAt != null);

    const data = {
      startAt,
      endAt,
      issuesByMonth,
    };

    const included = await entitiesCollector.fetchIncludedEntities();

    return c.json({
      success: true,
      data,
      included,
    } satisfies Response);
  },
);

issueHistoryYearRoute.route('/summary', issueHistoryYearSummaryRoute);
issueHistoryYearRoute.route('/:month', issueHistoryMonthRoute);