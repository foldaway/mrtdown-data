import OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import { getResponseDiagnostics } from './responseDiagnostics.js';

async function parseMockResponse(body: Record<string, unknown>) {
  const client = new OpenAI({
    apiKey: 'mock-key',
    fetch: async () =>
      new Response(
        JSON.stringify({
          id: 'resp_test',
          object: 'response',
          model: 'gpt-5.4-mini',
          status: 'completed',
          error: null,
          incomplete_details: null,
          usage: null,
          max_output_tokens: null,
          reasoning: null,
          output: [],
          ...body,
        }),
        {
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'req_test',
          },
        },
      ),
  });
  return client.responses.parse({
    model: 'gpt-5.4-mini',
    input: 'test',
    text: { format: { type: 'json_schema', name: 'Response', schema: {} } },
  });
}

describe('getResponseDiagnostics', () => {
  it('exposes a failed HTTP 200 response that the SDK returns without throwing', async () => {
    const response = await parseMockResponse({
      status: 'failed',
      error: { code: 'server_error', message: 'Upstream generation failed' },
    });
    expect(getResponseDiagnostics(response)).toMatchObject({
      responseId: 'resp_test',
      requestId: 'req_test',
      status: 'failed',
      error: { code: 'server_error', message: 'Upstream generation failed' },
      hasParsedOutput: false,
      output: [],
    });
  });

  it('records incomplete reasons and bounded refusals', async () => {
    const response = await parseMockResponse({
      status: 'incomplete',
      incomplete_details: { reason: 'content_filter' },
      output: [
        {
          type: 'message',
          status: 'incomplete',
          content: [{ type: 'refusal', refusal: 'x'.repeat(3_000) }],
        },
      ],
    });
    expect(getResponseDiagnostics(response)).toMatchObject({
      incompleteDetails: { reason: 'content_filter' },
      hasParsedOutput: false,
      output: [
        {
          type: 'message',
          status: 'incomplete',
          content: [{ type: 'refusal', refusal: 'x'.repeat(2_000) }],
        },
      ],
    });
  });

  it('summarizes tool and message output without dumping content or reasoning', async () => {
    const response = await parseMockResponse({
      output: [
        {
          type: 'reasoning',
          encrypted_content: 'private-reasoning',
          summary: [],
        },
        {
          type: 'function_call',
          name: 'findStations',
          arguments: '{"query":"private-query"}',
          call_id: 'call_test',
        },
        {
          type: 'message',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: '{"claims":["private-claim"]}',
              annotations: [],
            },
          ],
        },
      ],
    });
    const diagnostics = getResponseDiagnostics(response);
    expect(diagnostics.hasParsedOutput).toBe(true);
    expect(diagnostics.output).toEqual([
      { type: 'reasoning' },
      { type: 'function_call', name: 'findStations', status: undefined },
      {
        type: 'message',
        status: 'completed',
        content: [{ type: 'output_text', textLength: 28 }],
      },
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain('private-');
  });
});
