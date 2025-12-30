import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { zValidator } from '@hono/zod-validator';
import { ParamSchema } from './schema/param.js';
import { ResponseSchema, type Response } from './schema/response.js';
import { issueHistoryDayQuery } from './queries/issueHistoryDay.js';
import { DateTime } from 'luxon';
import { IncludedEntitiesCollector } from '../../../../../../../../../../utils/IncludedEntitiesCollector.js';
import { assert } from '../../../../../../../../../../../util/assert.js';

export const issueHistoryDayRoute = new Hono();

issueHistoryDayRoute.get(
  '/',
  zValidator('param', ParamSchema),
  describeRoute({
    description: 'Get issues for a specific day',
    responses: {
      200: {
        description: 'Issues for the specified day',
        content: {
          'application/json': {
            schema: resolver(ResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    const { day } = c.req.valid('param');
    const month = c.req.param('month');
    const year = c.req.param('year');
    assert(month != null);
    assert(year != null);
    const entitiesCollector = new IncludedEntitiesCollector();

    const startDate = DateTime.fromISO(`${year}-${month}-${day}`, {
      zone: 'Asia/Singapore',
    });
    const endDate = startDate.plus({ days: 1 });

    const issueIds = await issueHistoryDayQuery(year, month, day);
    entitiesCollector.addIssueIds(issueIds);

    const startAt = startDate.toISODate();
    assert(startAt != null);
    const endAt = endDate.toISODate();
    assert(endAt != null);

    const data = {
      startAt,
      endAt,
      issueIds,
    };

    const included = await entitiesCollector.fetchIncludedEntities();

    return c.json({
      success: true,
      data,
      included,
    } satisfies Response);
  },
);
