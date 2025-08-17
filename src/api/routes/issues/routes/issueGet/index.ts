import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { ResponseSchema, type Response } from './schema/response.js';
import { ParamSchema } from './schema/param.js';
import { issueGetQuery } from './queries/issueGet.js';
import { IncludedEntitiesCollector } from '../../../../utils/IncludedEntitiesCollector.js';

export const issueGetRoute = new Hono();
issueGetRoute.get(
  '/',
  describeRoute({
    description: 'Get issue details',
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
    const { issueId } = param;

    const entitiesCollector = new IncludedEntitiesCollector();

    const rows = await issueGetQuery(issueId);
    if (rows.length === 0) {
      return c.json(
        {
          success: false,
          error: 'Issue not found',
        },
        404,
      );
    }
    const [row] = rows;
    entitiesCollector.addIssueId(row.id);

    const included = await entitiesCollector.fetchIncludedEntities();

    const response: Response = {
      success: true,
      data: {
        id: row.id,
        updates: row.updates,
      },
      included,
    };

    return c.json(response);
  },
);
