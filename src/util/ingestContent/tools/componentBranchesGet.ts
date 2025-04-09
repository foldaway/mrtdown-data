import type { ChatCompletionTool } from 'openai/resources';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { StationModel } from '../../../model/StationModel';
import { ComponentIdSchema } from '../../../schema/Component';
import { ComponentModel } from '../../../model/ComponentModel';
import type { Station } from '../../../schema/Station';
import type { Tool } from '../types';
import { assert } from '../../assert';

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

  const result: Record<string, string[]> = {};
  for (const [branchName, stationCodes] of Object.entries(component.branches)) {
    result[branchName] = stationCodes.map((stationCode) => {
      assert(
        stationCode in stationsByStationCode,
        `Cannot find station by code: "${stationCode}"`,
      );
      return stationsByStationCode[stationCode].name;
    });
  }

  return `Branches for the line: ${JSON.stringify(result)}`;
}

export const TOOL_COMPONENT_BRANCHES_GET: Tool<ToolComponentBranchesGetParameters> =
  {
    name: TOOL_NAME_COMPONENT_BRANCHES_GET,
    description: 'Fetch a list of stations for a certain line',
    paramSchema: ToolComponentBranchesGetParametersSchema,
    runner: toolComponentBranchesGetRun,
  };
