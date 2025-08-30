import { Hono } from 'hono';
import { issueGetRoute } from './routes/issueGet/index.js';
import { issueHistoryRoute } from './routes/issueHistory/index.js';

export const issuesRoute = new Hono();
issuesRoute.route('/history', issueHistoryRoute);
issuesRoute.route('/:issueId', issueGetRoute);
