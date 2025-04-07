import type { ChatCompletionTool } from 'openai/resources';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

export const ToolStationSearchParameters = z.object({
  names: z.array(z.string()),
});

export const TOOL_NAME_STATION_SEARCH = 'stationSearch';

export const TOOL_DEFINITION_STATION_SEARCH: ChatCompletionTool = {
  type: 'function',
  function: {
    name: TOOL_NAME_STATION_SEARCH,
    description: 'Fetch a list of stations across all rail lines',
    parameters: zodToJsonSchema(ToolStationSearchParameters, {
      target: 'openAi',
    }),
  },
};
