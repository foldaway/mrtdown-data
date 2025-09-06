import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { ResponseSchema, type Response } from './schema/response.js';
import { IncludedEntitiesCollector } from '../../../../utils/IncludedEntitiesCollector.js';
import { stationGetAllQuery } from './queries/stationGetAll.js';

export const stationGetAllRoute = new Hono();
stationGetAllRoute.get(
  '/',
  describeRoute({
    description: 'Get all stations',
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
        description: 'Station not found',
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
  async (c) => {
    const entitiesCollector = new IncludedEntitiesCollector();

    const rows = await stationGetAllQuery();
    if (rows.length === 0) {
      return c.json(
        {
          success: false,
          error: 'Issue not found',
        },
        404,
      );
    }

    const stationIds = rows.map((r) => r.station_id);
    entitiesCollector.addStationIds(stationIds);

    const included = await entitiesCollector.fetchIncludedEntities();

    const response: Response = {
      success: true,
      data: {
        stationIds,
      },
      included,
    };

    return c.json(response);
  },
);
