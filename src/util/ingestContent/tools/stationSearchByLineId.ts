import type { ChatCompletionTool } from 'openai/resources';
import { z } from 'zod';
import { ComponentIdSchema } from '../../../schema/Component.js';
import { gfmToMarkdown } from 'mdast-util-gfm';
import type { Root, Table } from 'mdast';
import { toMarkdown } from 'mdast-util-to-markdown';
import type { Tool } from '../types.js';
import { lineGetQuery } from '../queries/lineGet.js';
import { assert } from '../../assert.js';
import { stationGetAllQuery } from '../queries/stationGetAll.js';
import { findStationByCode } from '../util/findStationByCode.js';
import { DateTime } from 'luxon';
import { stat } from 'node:fs/promises';

export const ToolStationSearchByLineIdParametersSchema = z.object({
  lineId: ComponentIdSchema,
});
export type ToolStationSearchByLineIdParameters = z.infer<
  typeof ToolStationSearchByLineIdParametersSchema
>;

export const TOOL_NAME_STATION_SEARCH_BY_LINE_ID = 'stationSearchByLineId';

export const TOOL_DEFINITION_STATION_SEARCH_BY_LINE_ID: ChatCompletionTool = {
  type: 'function',
  function: {
    name: TOOL_NAME_STATION_SEARCH_BY_LINE_ID,
    description: 'Fetch a list of stations for a certain line.',
    parameters: z.toJSONSchema(ToolStationSearchByLineIdParametersSchema),
  },
};

export async function toolStationSearchByLineIdRun(
  params: ToolStationSearchByLineIdParameters,
) {
  const { lineId } = params;

  const stationRows = await stationGetAllQuery();

  const lineRows = await lineGetQuery(lineId);
  assert(lineRows.length === 1, 'Line not found');
  const [line] = lineRows;

  console.log(
    `[toolStationSearchByLineIdRun] found ${line.branch_memberships.length} results.`,
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
                value: 'Branch ID (for this line)',
              },
            ],
          },
          {
            type: 'tableCell',
            children: [
              {
                type: 'text',
                value: 'Line IDs (this line and others if any)',
              },
            ],
          },
        ],
      },
    ],
  };

  for (const branchMembership of line.branch_memberships) {
    const station = findStationByCode(
      stationRows,
      DateTime.now(),
      lineId,
      branchMembership.code,
    );

    if (station == null) {
      throw new Error(
        `Could not find station for code ${branchMembership.code} on line ${lineId}`,
      );
    }

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
              value: branchMembership.branch_id,
            },
          ],
        },
        {
          type: 'tableCell',
          children: [
            {
              type: 'text',
              value: station.component_memberships
                .map((c) => c.component_id)
                .join(', '),
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

export const TOOL_STATION_SEARCH_BY_LINE_ID: Tool<ToolStationSearchByLineIdParameters> =
  {
    name: TOOL_NAME_STATION_SEARCH_BY_LINE_ID,
    description: 'Fetch a list of stations for a certain line',
    paramSchema: ToolStationSearchByLineIdParametersSchema,
    runner: toolStationSearchByLineIdRun,
  };
