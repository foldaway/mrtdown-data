import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { openAPIRouteHandler } from 'hono-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { compress } from 'hono/compress';
import { analyticsRoute } from './routes/analytics/index.js';
import { assert } from '../util/assert.js';
import { linesRoute } from './routes/lines/index.js';
import { overviewRoute } from './routes/overview/index.js';
import { issuesRoute } from './routes/issues/index.js';
import { stationsRoute } from './routes/stations/index.js';
import { metadataRoute } from './routes/metadata/index.js';

/**
 * The server accepts a comma-separated list of API tokens in the environment variable `API_TOKENS`.
 */
const { API_TOKENS } = process.env;
assert(API_TOKENS != null, 'API_TOKENS must be set in environment variables');

const app = new Hono();
app.use(compress());

const authMiddleware = bearerAuth({
  token: API_TOKENS.split(','),
});

app.use('*', async (c, next) => {
  const path = c.req.path;
  if (path.startsWith('/openapi') || path.startsWith('/docs')) {
    // Skip authentication for OpenAPI and docs routes
    return next();
  }

  return authMiddleware(c, next);
});

app.route('/overview', overviewRoute);
app.route('/analytics', analyticsRoute);
app.route('/lines', linesRoute);
app.route('/issues', issuesRoute);
app.route('/stations', stationsRoute);
app.route('/metadata', metadataRoute);
app.get('/healthz', async (c) => {
  return c.status(204);
});
app.get(
  '/openapi.json',
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: 'mrtdown',
        version: '1.0.0',
        description: 'API for mrtdown',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
          },
        },
      },
      security: [
        {
          bearerAuth: [],
        },
      ],
    },
  }),
);
app.get(
  '/docs',
  Scalar({
    theme: 'saturn',
    url: '/openapi.json',
  }),
);

export default app;
