import { Hono } from 'hono';
import { issueHistoryYearRoute } from './routes/year/index.js';

export const issueHistoryRoute = new Hono();
issueHistoryRoute.route('/:year', issueHistoryYearRoute);
