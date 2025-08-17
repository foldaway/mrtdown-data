import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import type { LineSummaryBasic } from '../../schema/LineSummary.js';
import { IncludedEntitiesCollector } from '../../utils/IncludedEntitiesCollector.js';
import { issueIdsOngoingQuery } from './queries/issueIdsOngoing.js';
import type { Response } from './schema/response.js';
import { ResponseSchema } from './schema/response.js';
import { lineSummariesQuery } from './queries/lineSummaries.js';

export const overviewRoute = new Hono();
overviewRoute.get(
  '/',
  describeRoute({
    description: 'Overview endpoint',
    responses: {
      200: {
        description: 'Successful overview response',
        content: {
          'application/json': {
            schema: resolver(ResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    const entitiesCollector = new IncludedEntitiesCollector();

    // Ongoing issues
    const issueIdsOngoingRows = await issueIdsOngoingQuery();
    const issueIdsOngoing = issueIdsOngoingRows.map((row) => row.issue_id);
    entitiesCollector.addIssueIds(issueIdsOngoing);

    // Line summaries
    const lineSummaries: LineSummaryBasic[] = [];
    const lineSummaryRows = await lineSummariesQuery();
    for (const row of lineSummaryRows) {
      lineSummaries.push({
        lineId: row.component_id,
        status: row.component_status,
        issueIdsOngoing: row.issue_ids_ongoing,
      });
      entitiesCollector.addLineId(row.component_id);
      entitiesCollector.addIssueIds(row.issue_ids_ongoing);
    }

    const included = await entitiesCollector.fetchIncludedEntities();

    const response: Response = {
      success: true,
      data: {
        lineSummaries,
        issueOngoingIds: issueIdsOngoing,
      },
      included,
    };

    return c.json(response);
  },
);
