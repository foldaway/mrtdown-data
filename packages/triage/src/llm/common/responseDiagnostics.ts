import type { ParsedResponse } from 'openai/resources/responses/responses.js';

type DiagnosticResponse = Pick<
  ParsedResponse<unknown>,
  | 'id'
  | 'model'
  | 'status'
  | 'error'
  | 'incomplete_details'
  | 'usage'
  | 'max_output_tokens'
  | 'reasoning'
  | 'output'
  | 'output_parsed'
> & { _request_id?: string | null };

/** Summarize API outcomes without logging evidence, tool arguments, or reasoning. */
export function getResponseDiagnostics(response: DiagnosticResponse) {
  return {
    responseId: response.id,
    requestId: response._request_id ?? null,
    model: response.model,
    status: response.status,
    maxOutputTokens: response.max_output_tokens,
    reasoning: response.reasoning,
    error:
      response.error == null
        ? null
        : {
            code: response.error.code,
            message: response.error.message.slice(0, 2_000),
          },
    incompleteDetails: response.incomplete_details,
    usage: response.usage,
    hasParsedOutput: response.output_parsed != null,
    output: response.output.map((item) => {
      switch (item.type) {
        case 'message':
          return {
            type: item.type,
            status: item.status,
            content: item.content.map((content) =>
              content.type === 'refusal'
                ? {
                    type: content.type,
                    refusal: content.refusal.slice(0, 2_000),
                  }
                : { type: content.type, textLength: content.text.length },
            ),
          };
        case 'function_call':
          return { type: item.type, name: item.name, status: item.status };
        default:
          return { type: item.type };
      }
    }),
  };
}
