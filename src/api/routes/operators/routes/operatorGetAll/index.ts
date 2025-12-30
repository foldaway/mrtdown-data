import { Hono } from 'hono';
import { ResponseSchema, type Response } from './schema/response.js';
import { describeRoute } from 'hono-openapi';
import { IncludedEntitiesCollector } from '../../../../utils/IncludedEntitiesCollector.js';
import { operatorGetAllQuery } from './queries/operatorGetAll.js';

export const operatorGetAllRoute = new Hono();

operatorGetAllRoute.get(
  '/',
  describeRoute({
    description: 'Get all operators',
    responses: {
      200: {
        description: 'Successful response',
      },
    },
  }),
  async (c) => {
    const entitiesCollector = new IncludedEntitiesCollector();

    const rows = await operatorGetAllQuery();
    if (rows.length === 0) {
      return c.json(
        {
          success: false,
          error: 'Operator not found',
        },
        404,
      );
    }

    const operatorIds = rows.map((r) => r.operator_id);
    entitiesCollector.addOperatorIds(operatorIds);

    const included = await entitiesCollector.fetchIncludedEntities();

    const response: Response = {
      success: true,
      data: {
        operatorIds,
      },
      included,
    };

    return c.json(response);
  },
);
