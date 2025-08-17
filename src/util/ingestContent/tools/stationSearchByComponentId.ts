import type { ChatCompletionTool } from 'openai/resources';
import { z } from 'zod';
import { StationModel } from '../../../model/StationModel.js';
import { ComponentIdSchema } from '../../../schema/Component.js';
import { gfmToMarkdown } from 'mdast-util-gfm';
import type { Root, Table } from 'mdast';
import { toMarkdown } from 'mdast-util-to-markdown';
import type { Tool } from '../types.js';

export const ToolStationSearchByComponentIdParametersSchema = z.object({
  componentId: ComponentIdSchema,
});
export type ToolStationSearchByComponentIdParameters = z.infer<
  typeof ToolStationSearchByComponentIdParametersSchema
>;

export const TOOL_NAME_STATION_SEARCH_BY_COMPONENT_ID =
  'stationSearchByComponentId';

export const TOOL_DEFINITION_STATION_SEARCH_BY_COMPONENT_ID: ChatCompletionTool =
  {
    type: 'function',
    function: {
      name: TOOL_NAME_STATION_SEARCH_BY_COMPONENT_ID,
      description: 'Fetch a list of stations for a certain line.',
      parameters: z.toJSONSchema(
        ToolStationSearchByComponentIdParametersSchema,
      ),
    },
  };

export async function toolStationSearchByComponentIdRun(
  params: ToolStationSearchByComponentIdParameters,
) {
  const { componentId } = params;
  const stations = StationModel.getByComponentId(componentId);

  console.log(
    `[toolStationSearchByComponentIdRun] found ${stations.length} results.`,
  );

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

export const TOOL_STATION_SEARCH_BY_COMPONENT_ID: Tool<ToolStationSearchByComponentIdParameters> =
  {
    name: TOOL_NAME_STATION_SEARCH_BY_COMPONENT_ID,
    description: 'Fetch a list of stations for a certain line',
    paramSchema: ToolStationSearchByComponentIdParametersSchema,
    runner: toolStationSearchByComponentIdRun,
  };
