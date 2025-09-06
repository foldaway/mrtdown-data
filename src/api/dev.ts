import app from './index.js';
import { serve } from '@hono/node-server';

serve(
  {
    ...app,
    port: 4000,
  },
  (info) => {
    console.log(`Listening on http://localhost:${info.port}`);
  },
);
