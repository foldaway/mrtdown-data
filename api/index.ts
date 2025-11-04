import { serve } from '@hono/node-server';
import app from '../src/api/index.js';

serve(
  {
    ...app,
    port: 4000,
  },
  (info) => {
    console.log(`Listening on http://localhost:${info.port}`);
  },
);
