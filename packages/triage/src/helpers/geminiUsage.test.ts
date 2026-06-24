import { describe, expect, it } from 'vitest';
import { GeminiUsageTracker, normalizeGeminiUsage } from './geminiUsage.js';

describe('normalizeGeminiUsage', () => {
  it('normalizes Gemini usage metadata', () => {
    expect(
      normalizeGeminiUsage({
        promptTokenCount: 1000,
        cachedContentTokenCount: 100,
        candidatesTokenCount: 2000,
        thoughtsTokenCount: 300,
        totalTokenCount: 3300,
      }),
    ).toEqual({
      inputTokens: 1000,
      cachedInputTokens: 100,
      outputTokens: 2000,
      thoughtTokens: 300,
      totalTokens: 3300,
    });
  });

  it('falls back to summing token counts when total is absent', () => {
    expect(
      normalizeGeminiUsage({
        promptTokenCount: 10,
        candidatesTokenCount: 20,
        thoughtsTokenCount: 3,
      }),
    ).toEqual({
      inputTokens: 10,
      cachedInputTokens: 0,
      outputTokens: 20,
      thoughtTokens: 3,
      totalTokens: 33,
    });
  });
});

describe('GeminiUsageTracker', () => {
  it('sums usage across multiple responses', () => {
    const tracker = new GeminiUsageTracker();

    tracker.add({
      inputTokens: 1000,
      cachedInputTokens: 100,
      outputTokens: 2000,
      thoughtTokens: 300,
      totalTokens: 3300,
    });
    tracker.add({
      inputTokens: 3000,
      cachedInputTokens: 200,
      outputTokens: 4000,
      thoughtTokens: 500,
      totalTokens: 7500,
    });

    expect(tracker.summary()).toEqual({
      usage: {
        inputTokens: 4000,
        cachedInputTokens: 300,
        outputTokens: 6000,
        thoughtTokens: 800,
        totalTokens: 10800,
      },
    });
  });
});
