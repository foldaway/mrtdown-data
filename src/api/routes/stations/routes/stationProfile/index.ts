import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { ResponseSchema, type Response } from './schema/response.js';
import { ParamSchema } from './schema/param.js';
import { IncludedEntitiesCollector } from '../../../../utils/IncludedEntitiesCollector.js';
import { stationGetQuery } from './queries/stationGet.js';
import { statusQuery } from './queries/status.js';
import { issueIdsRecentQuery } from './queries/issueIdsRecent.js';
import { issueCountByTypeQuery } from './queries/issueCountByType.js';

export const stationProfileRoute = new Hono();
stationProfileRoute.get(
  '/',
  describeRoute({
    description: 'Get Station Profile',
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
        description: 'Issue not found',
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
  async (c) => {
    const param = c.req.valid('param');
    const { stationId } = param;

    const entitiesCollector = new IncludedEntitiesCollector();

    const rows = await stationGetQuery(stationId);
    if (rows.length === 0) {
      return c.json(
        {
          success: false,
          error: 'Station not found',
        },
        404,
      );
    }
    const [row] = rows;
    entitiesCollector.addStationId(row.id);

    // Status

    const statusRows = await statusQuery(stationId);
    const [statusRow] = statusRows;

    // Recent Issues

    const issueIdsRecentRows = await issueIdsRecentQuery(stationId);
    const issueIdsRecent = issueIdsRecentRows.map((r) => r.issue_id);
    entitiesCollector.addIssueIds(issueIdsRecent);

    // Issue Count by Type
    const issueCountByType: Record<string, number> = {};
    const issueCountByTypeRows = await issueCountByTypeQuery(stationId);
    for (const row of issueCountByTypeRows) {
      issueCountByType[row.type] = row.count;
    }

    const included = await entitiesCollector.fetchIncludedEntities();

    const response: Response = {
      success: true,
      data: {
        stationId: row.id,
        status: statusRow.status,
        issueIdsRecent,
        issueCountByType,
      },
      included,
    };

    return c.json(response);
  },
);
