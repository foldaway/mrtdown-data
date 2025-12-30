import type { ChatCompletionTool } from 'openai/resources';
import { z } from 'zod';
import type { Tool } from '../types.js';
import { gfmToMarkdown } from 'mdast-util-gfm';
import type { Root, Table } from 'mdast';
import { toMarkdown } from 'mdast-util-to-markdown';
import { stationSearchQuery } from '../queries/stationSearch.js';

export const ToolStationSearchParametersSchema = z.object({
  stationNames: z
    .array(z.string())
    .describe('Station names. E.g. "Boon Lay", "Dakota"'),
});
export type ToolStationSearchParameters = z.infer<
  typeof ToolStationSearchParametersSchema
>;

export const TOOL_NAME_STATION_SEARCH = 'stationSearch';

export const TOOL_DEFINITION_STATION_SEARCH: ChatCompletionTool = {
  type: 'function',
  function: {
    name: TOOL_NAME_STATION_SEARCH,
    description: 'Fetch a list of stations by their names.',
    parameters: z.toJSONSchema(ToolStationSearchParametersSchema),
  },
};

export async function toolStationSearchRun(
  params: ToolStationSearchParameters,
) {
  const { stationNames } = params;

  const stationRows = await stationSearchQuery(stationNames);

  console.log(`[toolStationSearchRun] found ${stationRows.length} results.`);

  const table: Table = {
    type: 'table',
    children: [
      {
        type: 'tableRow',
        children: [
          {
            type: 'tableCell',
            children: [{ type: 'text', value: 'Station Name' }],
          },
          {
            type: 'tableCell',
            children: [{ type: 'text', value: 'Station Codes' }],
          },
          {
            type: 'tableCell',
            children: [{ type: 'text', value: 'Lines' }],
          },
        ],
      },
    ],
  };

  for (const stationRow of stationRows) {
    const stationCodes: string[] = [];
    const lineIds: string[] = [];

    for (const membership of stationRow.line_memberships) {
      stationCodes.push(membership.code);
      lineIds.push(membership.line_id);
    }

    table.children.push({
      type: 'tableRow',
      children: [
        {
          type: 'tableCell',
          children: [{ type: 'text', value: stationRow.name }],
        },
        {
          type: 'tableCell',
          children: [{ type: 'text', value: stationCodes.join(', ') }],
        },
        {
          type: 'tableCell',
          children: [{ type: 'text', value: lineIds.join(', ') }],
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

export const TOOL_STATION_SEARCH: Tool<ToolStationSearchParameters> = {
  name: TOOL_NAME_STATION_SEARCH,
  description: 'Fetch a list of stations by their names',
  paramSchema: ToolStationSearchParametersSchema,
  runner: toolStationSearchRun,
};
