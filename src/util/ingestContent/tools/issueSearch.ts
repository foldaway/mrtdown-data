import type { ChatCompletionTool } from 'openai/resources';
import z from 'zod';
import { issueSearchQuery } from '../queries/issueSearch.js';
import type { Root, Table } from 'mdast';
import { toMarkdown } from 'mdast-util-to-markdown';
import { gfmToMarkdown } from 'mdast-util-gfm';
import type { Tool } from '../types.js';
import { DateTime } from 'luxon';
import { assert } from '../../assert.js';

export const ToolIssueSearchParametersSchema = z.object({
  dateMin: z.iso.datetime(),
  dateMax: z.iso.datetime(),
});
export type ToolIssueSearchParameters = z.infer<
  typeof ToolIssueSearchParametersSchema
>;

export const TOOL_NAME_ISSUE_SEARCH = 'issueSearch';

export const TOOL_DEFINITION_ISSUE_SEARCH: ChatCompletionTool = {
  type: 'function',
  function: {
    name: TOOL_NAME_ISSUE_SEARCH,
    description:
      'Search for existing MRT/LRT issues by keywords and date range.',
    parameters: z.toJSONSchema(ToolIssueSearchParametersSchema),
  },
};

export async function toolIssueSearchRun(params: ToolIssueSearchParameters) {
  const { dateMin, dateMax } = params;

  console.log(
    `[toolIssueSearchRun] Searching for issues between ${dateMin} and ${dateMax}`,
  );

  const issueRows = await issueSearchQuery(dateMin, dateMax);

  const table: Table = {
    type: 'table',
    children: [
      {
        type: 'tableRow',
        children: [
          {
            type: 'tableCell',
            children: [{ type: 'text', value: 'Issue ID' }],
          },
          {
            type: 'tableCell',
            children: [{ type: 'text', value: 'Issue Title' }],
          },
          {
            type: 'tableCell',
            children: [{ type: 'text', value: 'Issue Type' }],
          },
          {
            type: 'tableCell',
            children: [{ type: 'text', value: 'Updates' }],
          },
        ],
      },
    ],
  };

  for (const issueRow of issueRows) {
    table.children.push({
      type: 'tableRow',
      children: [
        {
          type: 'tableCell',
          children: [{ type: 'text', value: issueRow.issue_id }],
        },
        {
          type: 'tableCell',
          children: [{ type: 'text', value: issueRow.title }],
        },
        {
          type: 'tableCell',
          children: [{ type: 'text', value: issueRow.type }],
        },
        {
          type: 'tableCell',
          children: [
            {
              type: 'text',
              value: issueRow.updates
                .map((update) => {
                  const createdAt = DateTime.fromISO(update.created_at, {
                    zone: 'Asia/Singapore',
                  }).toISO();
                  assert(createdAt != null, 'Expected valid created_at');

                  return `- [${update.type}] ${update.text} (${createdAt})`;
                })
                .join('\n'),
            },
          ],
        },
      ],
    });
  }

  const root: Root = {
    type: 'root',
    children: [table],
  };

  return toMarkdown(root, {
    extensions: [gfmToMarkdown()],
  });
}

export const TOOL_ISSUE_SEARCH: Tool<ToolIssueSearchParameters> = {
  name: TOOL_NAME_ISSUE_SEARCH,
  description:
    'Search for existing MRT/LRT issues by keywords and date range. Returns a markdown table of issues found.',
  paramSchema: ToolIssueSearchParametersSchema,
  runner: toolIssueSearchRun,
};
