import { Hono } from 'hono';
import { lineProfileRoute } from './routes/lineProfile/index.js';

export const linesRoute = new Hono();
linesRoute.route('/:lineId/profile', lineProfileRoute);
