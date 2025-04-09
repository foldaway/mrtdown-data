import type { ChatCompletionTool } from 'openai/resources';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { StationModel } from '../../../model/StationModel';
import { ComponentIdSchema } from '../../../schema/Component';
import type { Tool } from '../types';

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
      description: 'Fetch a list of stations for a certain line',
      parameters: zodToJsonSchema(
        ToolStationSearchByComponentIdParametersSchema,
        {
          target: 'openAi',
        },
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

  return `Valid station names: ${JSON.stringify(
    stations.map((s) => {
      const codes = Object.values(s.componentMembers).flatMap((members) =>
        members.map((m) => m.code),
      );

      return {
        name: s.name,
        componentIds: Object.keys(s.componentMembers),
        codes,
      };
    }),
  )}`;
}

export const TOOL_STATION_SEARCH_BY_COMPONENT_ID: Tool<ToolStationSearchByComponentIdParameters> =
  {
    name: TOOL_NAME_STATION_SEARCH_BY_COMPONENT_ID,
    description: 'Fetch a list of stations for a certain line',
    paramSchema: ToolStationSearchByComponentIdParametersSchema,
    runner: toolStationSearchByComponentIdRun,
  };
