import { Hono } from 'hono';
import { lineProfileRoute } from './routes/lineProfile/index.js';
import { lineGetAllRoute } from './routes/lineGetAll/index.js';

export const linesRoute = new Hono();
linesRoute.route('/', lineGetAllRoute);
linesRoute.route('/:lineId/profile', lineProfileRoute);
