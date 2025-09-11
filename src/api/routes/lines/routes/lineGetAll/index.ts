import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { ResponseSchema, type Response } from './schema/response.js';
import { IncludedEntitiesCollector } from '../../../../utils/IncludedEntitiesCollector.js';
import { lineGetAllQuery } from './queries/lineGetAll.js';

export const lineGetAllRoute = new Hono();
lineGetAllRoute.get(
  '/',
  describeRoute({
    description: 'Get all lines',
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

    const rows = await lineGetAllQuery();
    if (rows.length === 0) {
      return c.json(
        {
          success: false,
          error: 'Issue not found',
        },
        404,
      );
    }

    const lineIds = rows.map((r) => r.component_id);
    entitiesCollector.addLineIds(lineIds);

    const included = await entitiesCollector.fetchIncludedEntities();

    const response: Response = {
      success: true,
      data: {
        lineIds,
      },
      included,
    };

    return c.json(response);
  },
);
