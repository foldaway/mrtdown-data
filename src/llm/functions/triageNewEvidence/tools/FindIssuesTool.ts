import type { Table } from 'mdast';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { toMarkdown } from 'mdast-util-to-markdown';
import z from 'zod';
import { Tool } from '../../../common/tool.js';
import type { MRTDownRepository } from '../../../../repo/MRTDownRepository.js';

const FindIssuesToolParametersSchema = z.object({
  query: z.string().describe('Plain text to search for issues.'),
});
type FindIssuesToolParameters = z.infer<typeof FindIssuesToolParametersSchema>;

export class FindIssuesTool extends Tool<FindIssuesToolParameters> {
  public name = 'findIssues';
  public description = 'Find issues by query';
  private readonly repo: MRTDownRepository;

  constructor(repo: MRTDownRepository) {
    super();
    this.repo = repo;
  }

  public get paramsSchema(): { [key: string]: unknown } {
    return z.toJSONSchema(FindIssuesToolParametersSchema);
  }

  public parseParams(params: unknown): FindIssuesToolParameters {
    return FindIssuesToolParametersSchema.parse(params);
  }

  public async runner(params: FindIssuesToolParameters): Promise<string> {
    console.log('[findIssues] Calling tool with parameters:', params);

    const issues = this.repo.issues.searchByQuery(params.query);

    const issueTable: Table = {
      type: 'table',
      children: [
        {
          type: 'tableRow',
          children: [
            {
              type: 'tableCell',
              children: [{ type: 'text', value: 'Issue ID' }],
            },
            {
              type: 'tableCell',
              children: [{ type: 'text', value: 'Issue Title' }],
            },
          ],
        },
      ],
    };

    for (const issue of issues) {
      issueTable.children.push({
        type: 'tableRow',
        children: [
          {
            type: 'tableCell',
            children: [{ type: 'text', value: issue.issue.id }],
          },
          {
            type: 'tableCell',
            children: [{ type: 'text', value: issue.issue.title['en-SG'] }],
          },
        ],
      });
    }

    const output = toMarkdown(issueTable, {
      extensions: [gfmToMarkdown()],
    });
    console.log(`[findIssues] Response output:\n${output}`);

    return output;
  }
}
