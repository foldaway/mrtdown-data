import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { ResponseSchema, type Response } from './schema/response.js';
import { ParamSchema } from './schema/param.js';
import { IncludedEntitiesCollector } from '../../../../utils/IncludedEntitiesCollector.js';
import { operatorProfileQuery } from './queries/operatorProfile.js';

export const operatorProfileRoute = new Hono();

operatorProfileRoute.get(
  '/',
  describeRoute({
    description: 'Get the profile of an operator',
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
        description: 'Operator not found',
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
    const { operatorId } = param;

    const entitiesCollector = new IncludedEntitiesCollector();

    const rows = await operatorProfileQuery(operatorId);
    if (rows.length === 0) {
      return c.json(
        {
          success: false,
          error: 'Operator not found',
        },
        404,
      );
    }

    const [row] = rows;
    entitiesCollector.addOperatorId(row.operator_id);
    entitiesCollector.addLineIds(row.line_ids);

    const included = await entitiesCollector.fetchIncludedEntities();

    const response: Response = {
      success: true,
      data: {
        operatorId: row.operator_id,
        lineIds: row.line_ids,
      },
      included,
    };

    return c.json(response);
  },
);
