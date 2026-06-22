import { GoogleGenAI } from '@google/genai';
import { afterEach, describe, expect, it } from 'vitest';
import { getGeminiClient } from './client.js';

const originalApiKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  if (originalApiKey == null) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = originalApiKey;
  }
});

describe('getGeminiClient', () => {
  it('requires a Gemini API key', () => {
    delete process.env.GEMINI_API_KEY;

    expect(() => getGeminiClient()).toThrow(
      'GEMINI_API_KEY must be set before creating Gemini client',
    );
  });

  it('creates a Gemini SDK client', () => {
    process.env.GEMINI_API_KEY = 'test-key';

    const client = getGeminiClient();

    expect(client).toBeInstanceOf(GoogleGenAI);
  });
});
