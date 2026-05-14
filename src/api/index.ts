import { Hono } from 'hono';
import * as Sentry from '@sentry/node';
import { serve } from '@hono/node-server';
import { bearerAuth } from 'hono/bearer-auth';
import { openAPIRouteHandler } from 'hono-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyticsRoute } from './routes/analytics/index.js';
import { assert } from '../util/assert.js';
import { linesRoute } from './routes/lines/index.js';
import { overviewRoute } from './routes/overview/index.js';
import { issuesRoute } from './routes/issues/index.js';
import { stationsRoute } from './routes/stations/index.js';
import { metadataRoute } from './routes/metadata/index.js';
import { HTTPException } from 'hono/http-exception';
import { operatorsRoute } from './routes/operators/index.js';
import { logger } from 'hono/logger';

/**
 * The server accepts a comma-separated list of API tokens in the environment variable `API_TOKENS`.
 */
const { API_TOKENS } = process.env;
assert(API_TOKENS != null, 'API_TOKENS must be set in environment variables');

const app = new Hono();
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  console.error(err);

  Sentry.captureException(err);
  return c.json({ error: 'Internal server error' }, 500);
});

const authMiddleware = bearerAuth({
  token: API_TOKENS.split(','),
});

app.use(logger());

app.use('*', async (c, next) => {
  const path = c.req.path;
  if (
    path.startsWith('/openapi') ||
    path.startsWith('/docs') ||
    path === '/healthz'
  ) {
    // Skip authentication for OpenAPI, docs and health routes
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
app.route('/operators', operatorsRoute);
app.get('/healthz', async (c) => {
  return c.body(null, 204);
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

if (
  process.env.MRTDOWN_LEGACY_API_ENTRYPOINT === 'true' &&
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { SENTRY_DSN, SENTRY_ENVIRONMENT, SENTRY_RELEASE } = process.env;

  Sentry.init({
    dsn: SENTRY_DSN,
    release: SENTRY_RELEASE,
    environment: SENTRY_ENVIRONMENT,
  });

  const port = Number.parseInt(process.env.PORT ?? '4000', 10);
  assert(Number.isInteger(port) && port > 0, 'PORT must be a positive integer');

  serve(
    {
      ...app,
      port,
    },
    (info) => {
      console.log(`Listening on http://localhost:${info.port}`);
    },
  );
}

export default app;
