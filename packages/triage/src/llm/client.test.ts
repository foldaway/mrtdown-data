import { afterEach, describe, expect, it } from 'vitest';
import { getOpenAiClient } from './client.js';

const originalApiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (originalApiKey == null) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalApiKey;
  }
});

describe('getOpenAiClient', () => {
  it('requires an OpenAI API key', () => {
    delete process.env.OPENAI_API_KEY;

    expect(() => getOpenAiClient()).toThrow(
      'OPENAI_API_KEY must be set before creating OpenAI client',
    );
  });

  it('disables OpenAI SDK request retries', () => {
    process.env.OPENAI_API_KEY = 'test-key';

    const client = getOpenAiClient();

    expect(client.maxRetries).toBe(0);
  });
});
