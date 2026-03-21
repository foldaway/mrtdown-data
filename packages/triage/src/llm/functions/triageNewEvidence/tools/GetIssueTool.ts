import type { MRTDownRepository } from '@mrtdown/fs';
import z from 'zod';
import { deriveCurrentState } from '../../../../helpers/deriveCurrentState.js';
import { formatCurrentState } from '../../../common/formatCurrentState.js';
import { Tool } from '../../../common/tool.js';

const GetIssueToolParametersSchema = z.object({
  issueId: z.string(),
});
type GetIssueToolParameters = z.infer<typeof GetIssueToolParametersSchema>;

export class GetIssueTool extends Tool<GetIssueToolParameters> {
  public name = 'getIssue';
  public description = 'Get an issue by ID';
  private readonly repo: MRTDownRepository;

  constructor(repo: MRTDownRepository) {
    super();
    this.repo = repo;
  }

  public get paramsSchema(): { [key: string]: unknown } {
    return z.toJSONSchema(GetIssueToolParametersSchema);
  }

  public parseParams(params: unknown): GetIssueToolParameters {
    return GetIssueToolParametersSchema.parse(params);
  }

  public async runner(params: GetIssueToolParameters): Promise<string> {
    console.log('[getIssue] Calling tool with parameters:', params);

    const issueBundle = this.repo.issues.get(params.issueId);
    if (issueBundle == null) {
      return `Issue ${params.issueId} not found`;
    }

    const currentState = deriveCurrentState(issueBundle);

    const output = formatCurrentState({
      state: currentState,
      evidence: issueBundle.evidence,
    });
    console.log(`[getIssue] Response output:\n${output}`);

    return output;
  }
}
