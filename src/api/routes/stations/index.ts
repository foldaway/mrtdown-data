import { Hono } from 'hono';
import { stationProfileRoute } from './routes/stationProfile/index.js';

export const stationsRoute = new Hono();
stationsRoute.route('/:stationId/profile', stationProfileRoute);
