import { Hono } from 'hono';
import { issueGetRoute } from './routes/issueGet/index.js';

export const issuesRoute = new Hono();
issuesRoute.route('/:issueId', issueGetRoute);
