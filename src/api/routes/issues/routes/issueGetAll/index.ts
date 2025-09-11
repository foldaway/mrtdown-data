import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { ResponseSchema, type Response } from './schema/response.js';
import { IncludedEntitiesCollector } from '../../../../utils/IncludedEntitiesCollector.js';
import { issueGetAllQuery } from './queries/issuesGetAll.js';
import { monthLatestQuery } from './queries/monthLatest.js';
import { DateTime } from 'luxon';
import { assert } from '../../../../../util/assert.js';
import { monthEarliestQuery } from './queries/monthEarliest.js';

export const issueGetAllRoute = new Hono();
issueGetAllRoute.get(
  '/',
  describeRoute({
    description: 'Get all issues',
    responses: {
      200: {
        description: 'Successful response',
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

    const rows = await issueGetAllQuery();
    if (rows.length === 0) {
      return c.json(
        {
          success: false,
          error: 'Issue not found',
        },
        404,
      );
    }

    const issueIds = rows.map((r) => r.issue_id);
    entitiesCollector.addIssueIds(issueIds);

    // Month earliest
    const monthEarliestQueryRows = await monthEarliestQuery();
    if (monthEarliestQueryRows.length === 0) {
      return c.json(
        {
          success: false,
          error: 'No intervals found',
        },
        500,
      );
    }
    const [monthEarliestQueryRow] = monthEarliestQueryRows;
    const monthEarliestDateTime = DateTime.fromSQL(
      monthEarliestQueryRow.start_at,
    );
    const monthEarliest = monthEarliestDateTime.toISODate();
    assert(monthEarliest != null);

    // Month latest
    const monthLatestQueryRows = await monthLatestQuery();
    if (monthLatestQueryRows.length === 0) {
      return c.json(
        {
          success: false,
          error: 'No intervals found',
        },
        500,
      );
    }

    const [monthLatestQueryRow] = monthLatestQueryRows;
    const monthLatestDateTime = DateTime.fromSQL(monthLatestQueryRow.end_at);
    const monthLatest = monthLatestDateTime.toISODate();
    assert(monthLatest != null);

    const included = await entitiesCollector.fetchIncludedEntities();

    const response: Response = {
      success: true,
      data: {
        issueIds,
        monthEarliest,
        monthLatest,
      },
      included,
    };

    return c.json(response);
  },
);
