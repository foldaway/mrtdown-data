import type { ChatCompletionTool } from 'openai/resources';
import { z } from 'zod';
import { LineIdSchema } from '../../../schema/Line.js';
import type { Tool } from '../types.js';
import { gfmToMarkdown } from 'mdast-util-gfm';
import type { Root, Table } from 'mdast';
import { toMarkdown } from 'mdast-util-to-markdown';
import { lineBranchGetAllQuery } from '../queries/lineBranchGetAll.js';

export const ToolLineBranchesGetParametersSchema = z.object({
  lineId: LineIdSchema,
});
export type ToolLineBranchesGetParameters = z.infer<
  typeof ToolLineBranchesGetParametersSchema
>;

export const TOOL_NAME_LINE_BRANCHES_GET = 'lineBranchesGet';

export const TOOL_DEFINITION_LINE_BRANCHES_GET: ChatCompletionTool = {
  type: 'function',
  function: {
    name: TOOL_NAME_LINE_BRANCHES_GET,
    description: 'Get the branches of a line',
    parameters: z.toJSONSchema(ToolLineBranchesGetParametersSchema),
  },
};

export async function toolLineBranchesGetRun(
  params: ToolLineBranchesGetParameters,
) {
  const { lineId } = params;

  const lineBranchRows = await lineBranchGetAllQuery(lineId);

  console.log(
    `[toolLineBranchesGetRun] found ${lineBranchRows.length} results.`,
  );

  const table: Table = {
    type: 'table',
    children: [
      {
        type: 'tableRow',
        children: [
          {
            type: 'tableCell',
            children: [{ type: 'text', value: 'Branch ID' }],
          },
          {
            type: 'tableCell',
            children: [{ type: 'text', value: 'Stations' }],
          },
        ],
      },
    ],
  };

  let lineTitle = '';

  for (const lineBranchRow of lineBranchRows) {
    const stationNames = lineBranchRow.station_names.join(', ');

    lineTitle = lineBranchRow.line_title;

    table.children.push({
      type: 'tableRow',
      children: [
        {
          type: 'tableCell',
          children: [{ type: 'text', value: lineBranchRow.branch_id }],
        },
        {
          type: 'tableCell',
          children: [{ type: 'text', value: stationNames }],
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
        children: [
          {
            type: 'text',
            value: `Branches for line id=${lineId} title=${lineTitle}`,
          },
        ],
      },
      table,
    ],
  };

  return toMarkdown(root, {
    extensions: [gfmToMarkdown()],
  });
}

export const TOOL_LINE_BRANCHES_GET: Tool<ToolLineBranchesGetParameters> = {
  name: TOOL_NAME_LINE_BRANCHES_GET,
  description: 'Fetch a list of stations and branches for a certain line',
  paramSchema: ToolLineBranchesGetParametersSchema,
  runner: toolLineBranchesGetRun,
};
