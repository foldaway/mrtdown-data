import { serve } from '@hono/node-server';
import app from '../src/api/index.js';

serve(app, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
});
