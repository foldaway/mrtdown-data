import { Hono } from 'hono';
import { issueGetRoute } from './routes/issueGet/index.js';
import { issueHistoryRoute } from './routes/issueHistory/index.js';
import { issueGetAllRoute } from './routes/issueGetAll/index.js';

export const issuesRoute = new Hono();
issuesRoute.route('/', issueGetAllRoute);
issuesRoute.route('/history', issueHistoryRoute);
issuesRoute.route('/:issueId', issueGetRoute);
