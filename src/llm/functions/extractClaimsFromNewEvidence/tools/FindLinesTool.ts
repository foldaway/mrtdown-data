import type { Table } from 'mdast';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { toMarkdown } from 'mdast-util-to-markdown';
import z from 'zod';
import type { MRTDownRepository } from '#repo/MRTDownRepository.js';
import { Tool } from '../../../common/tool.js';

const FindLinesToolParametersSchema = z.object({
  lineNames: z.array(z.string()),
});
type FindLinesToolParameters = z.infer<typeof FindLinesToolParametersSchema>;

export class FindLinesTool extends Tool<FindLinesToolParameters> {
  public name = 'findLines';
  public description = 'Find lines by name';
  private readonly repo: MRTDownRepository;

  constructor(repo: MRTDownRepository) {
    super();
    this.repo = repo;
  }

  public get paramsSchema(): { [key: string]: unknown } {
    return z.toJSONSchema(FindLinesToolParametersSchema);
  }

  public parseParams(params: unknown): FindLinesToolParameters {
    return FindLinesToolParametersSchema.parse(params);
  }

  public async runner(params: FindLinesToolParameters): Promise<string> {
    console.log('[findLines] Calling tool with parameters:', params);

    const lines = this.repo.lines.searchByName(params.lineNames);

    const table: Table = {
      type: 'table',
      children: [
        {
          type: 'tableRow',
          children: [
            {
              type: 'tableCell',
              children: [{ type: 'text', value: 'Line ID' }],
            },
            {
              type: 'tableCell',
              children: [{ type: 'text', value: 'Line Name' }],
            },
          ],
        },
      ],
    };

    for (const line of lines) {
      table.children.push({
        type: 'tableRow',
        children: [
          {
            type: 'tableCell',
            children: [{ type: 'text', value: line.id }],
          },
          {
            type: 'tableCell',
            children: [{ type: 'text', value: line.name['en-SG'] }],
          },
        ],
      });
    }

    const output = toMarkdown(table, {
      extensions: [gfmToMarkdown()],
    });
    console.log(`[findLines] Response output:\n${output}`);

    return output;
  }
}
