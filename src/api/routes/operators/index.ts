import { Hono } from 'hono';
import { operatorGetAllRoute } from './routes/operatorGetAll/index.js';
import { operatorProfileRoute } from './routes/operatorProfile/index.js';

export const operatorsRoute = new Hono();
operatorsRoute.route('/', operatorGetAllRoute);
operatorsRoute.route('/:operatorId/profile', operatorProfileRoute);
