import type { ChatCompletionTool } from 'openai/resources';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { StationModel } from '../../../model/StationModel';
import { ComponentIdSchema } from '../../../schema/Component';
import { ComponentModel } from '../../../model/ComponentModel';
import type { Station } from '../../../schema/Station';
import type { Tool } from '../types';
import { assert } from '../../assert';
import { gfmToMarkdown } from 'mdast-util-gfm';
import type { Root, Table } from 'mdast';
import { toMarkdown } from 'mdast-util-to-markdown';
import { DateTime } from 'luxon';

export const ToolComponentBranchesGetParametersSchema = z.object({
  componentId: ComponentIdSchema,
});
export type ToolComponentBranchesGetParameters = z.infer<
  typeof ToolComponentBranchesGetParametersSchema
>;

export const TOOL_NAME_COMPONENT_BRANCHES_GET = 'componentBranchesGet';

export const TOOL_DEFINITION_COMPONENT_BRANCHES_GET: ChatCompletionTool = {
  type: 'function',
  function: {
    name: TOOL_NAME_COMPONENT_BRANCHES_GET,
    description: 'Get the branches of a component',
    parameters: zodToJsonSchema(ToolComponentBranchesGetParametersSchema, {
      target: 'openAi',
    }),
  },
};

export async function toolComponentBranchesGetRun(
  params: ToolComponentBranchesGetParameters,
) {
  const { componentId } = params;
  const component = ComponentModel.getOne(componentId);
  const stations = StationModel.getByComponentId(componentId);

  const stationsByStationCode: Record<string, Station> = {};
  for (const station of stations) {
    for (const member of station.componentMembers[componentId]) {
      stationsByStationCode[member.code] = station;
    }
  }

  console.log(
    `[toolComponentBranchesGetRun] found ${stations.length} results.`,
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
                value: 'Branch Code',
              },
            ],
          },
          {
            type: 'tableCell',
            children: [
              {
                type: 'text',
                value: 'Station Names',
              },
            ],
          },
        ],
      },
    ],
  };

  for (const [branchCode, branch] of Object.entries(component.branches)) {
    if (branch.startedAt == null) {
      continue;
    }
    if (
      branch.endedAt != null &&
      DateTime.fromISO(branch.endedAt).diffNow().as('days') < 0
    ) {
      continue;
    }
    table.children.push({
      type: 'tableRow',
      children: [
        {
          type: 'tableCell',
          children: [
            {
              type: 'text',
              value: branchCode,
            },
          ],
        },
        {
          type: 'tableCell',
          children: [
            {
              type: 'text',
              value: branch.stationCodes
                .map((stationCode) => {
                  assert(
                    stationCode in stationsByStationCode,
                    `Cannot find station by code: "${stationCode}"`,
                  );
                  return stationsByStationCode[stationCode].name;
                })
                .join(', '),
            },
          ],
        },
      ],
    });
  }

  const root: Root = {
    type: 'root',
    children: [
      {
        type: 'heading',
        depth: 1,
        children: [{ type: 'text', value: component.title }],
      },
      table,
    ],
  };

  return toMarkdown(root, {
    extensions: [gfmToMarkdown()],
  });
}

export const TOOL_COMPONENT_BRANCHES_GET: Tool<ToolComponentBranchesGetParameters> =
  {
    name: TOOL_NAME_COMPONENT_BRANCHES_GET,
    description: 'Fetch a list of stations for a certain line',
    paramSchema: ToolComponentBranchesGetParametersSchema,
    runner: toolComponentBranchesGetRun,
  };
