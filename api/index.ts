import { serve } from '@hono/node-server';
import app from '../src/api/index.js';
import * as Sentry from '@sentry/node';

const { SENTRY_DSN, SENTRY_ENVIRONMENT, GIT_SHA } = process.env;

Sentry.init({
  dsn: SENTRY_DSN,
  release: GIT_SHA,
  environment: SENTRY_ENVIRONMENT,
});

serve(
  {
    ...app,
    port: 4000,
  },
  (info) => {
    console.log(`Listening on http://localhost:${info.port}`);
  },
);
