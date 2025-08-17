import { Hono } from 'hono';
import { stationProfileRoute } from './routes/stationProfile/index.js';
import { stationGetAllRoute } from './routes/stationGetAll/index.js';

export const stationsRoute = new Hono();
stationsRoute.route('/', stationGetAllRoute);
stationsRoute.route('/:stationId/profile', stationProfileRoute);
