import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { zValidator } from '@hono/zod-validator';
import { ParamSchema } from './schema/param.js';
import { ResponseSchema, type Response } from './schema/response.js';
import { issueHistoryQuery } from './queries/issueHistory.js';
import { DateTime } from 'luxon';
import { IncludedEntitiesCollector } from '../../../../../../../../utils/IncludedEntitiesCollector.js';
import { assert } from '../../../../../../../../../util/assert.js';

export const issueHistoryMonthRoute = new Hono();

issueHistoryMonthRoute.get(
  '/',
  zValidator('param', ParamSchema),
  describeRoute({
    description: 'Get issues for a specific month',
    responses: {
      200: {
        description: 'Issues for the specified month',
        content: {
          'application/json': {
            schema: resolver(ResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    const { month } = c.req.valid('param');
    const year = c.req.param('year');
    assert(year != null);
    const entitiesCollector = new IncludedEntitiesCollector();

    const startDate = DateTime.fromISO(`${year}-${month}-01`, {
      zone: 'Asia/Singapore',
    });
    const endDate = startDate.plus({ months: 1 });

    const rows = await issueHistoryQuery(year, month);

    const issuesByWeek = rows.map((row) => ({
      week: row.week,
      issueIds: row.issue_ids,
    }));

    const allIssueIds = rows.flatMap((row) => row.issue_ids);
    entitiesCollector.addIssueIds(allIssueIds);

    const startAt = startDate.toISODate();
    assert(startAt != null);
    const endAt = endDate.toISODate();
    assert(endAt != null);

    const data = {
      startAt,
      endAt,
      issuesByWeek,
    };

    const included = await entitiesCollector.fetchIncludedEntities();

    return c.json({
      success: true,
      data,
      included,
    } satisfies Response);
  },
);
