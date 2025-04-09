import type { ChatCompletionTool } from 'openai/resources';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { StationModel } from '../../../model/StationModel';
import type { Tool } from '../types';

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
    description: 'Fetch a list of stations by their names',
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

export const TOOL_STATION_SEARCH: Tool<ToolStationSearchParameters> = {
  name: TOOL_NAME_STATION_SEARCH,
  description: 'Fetch a list of stations by their names',
  paramSchema: ToolStationSearchParametersSchema,
  runner: toolStationSearchRun,
};
