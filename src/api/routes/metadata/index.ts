import { Hono } from 'hono';
import { ResponseSchema, type Response } from './schema/response.js';
import { metadataQuery } from './queries/metadata.js';
import { describeRoute, resolver } from 'hono-openapi';

export const metadataRoute = new Hono();
metadataRoute.get(
  '/',
  describeRoute({
    description: 'Get metadata',
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
        description: 'Not found',
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
    const metadataRows = await metadataQuery();
    return c.json({
      data: metadataRows,
      success: true,
      included: {
        lines: {},
        stations: {},
        issues: {},
        landmarks: {},
        towns: {},
      },
    } satisfies Response);
  },
);
