import type { ChatCompletionTool } from 'openai/resources';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { StationModel } from '../../../model/StationModel';
import type { Tool } from '../types';
import { gfmToMarkdown } from 'mdast-util-gfm';
import type { Root, Table } from 'mdast';
import { toMarkdown } from 'mdast-util-to-markdown';

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
    parameters: zodToJsonSchema(ToolStationSearchParametersSchema, {
      target: 'openAi',
    }),
  },
};

export async function toolStationSearchRun(
  params: ToolStationSearchParameters,
) {
  const { stationNames } = params;
  const stations = StationModel.searchByName(stationNames);

  console.log(`[toolStationSearchRun] found ${stations.length} results.`);

  const table: Table = {
    type: 'table',
    children: [
      {
        type: 'tableRow',
        children: [
          {
            type: 'tableCell',
            children: [
              {
                type: 'text',
                value: 'Station Name',
              },
            ],
          },
          {
            type: 'tableCell',
            children: [
              {
                type: 'text',
                value: 'Station Codes',
              },
            ],
          },
          {
            type: 'tableCell',
            children: [
              {
                type: 'text',
                value: 'Component IDs',
              },
            ],
          },
        ],
      },
    ],
  };

  for (const station of stations) {
    const codes = Object.values(station.componentMembers).flatMap((members) =>
      members.map((m) => m.code),
    );

    table.children.push({
      type: 'tableRow',
      children: [
        {
          type: 'tableCell',
          children: [
            {
              type: 'text',
              value: station.name,
            },
          ],
        },
        {
          type: 'tableCell',
          children: [
            {
              type: 'text',
              value: codes.join(', '),
            },
          ],
        },
        {
          type: 'tableCell',
          children: [
            {
              type: 'text',
              value: Object.keys(station.componentMembers).join(', '),
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

export const TOOL_STATION_SEARCH: Tool<ToolStationSearchParameters> = {
  name: TOOL_NAME_STATION_SEARCH,
  description: 'Fetch a list of stations by their names',
  paramSchema: ToolStationSearchParametersSchema,
  runner: toolStationSearchRun,
};
