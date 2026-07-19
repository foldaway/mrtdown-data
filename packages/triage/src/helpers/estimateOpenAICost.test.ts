import { describe, expect, it } from 'vitest';
import {
  estimateOpenAICostFromUsage,
  OpenAIUsageCostTracker,
} from './estimateOpenAICost.js';

describe('estimateOpenAICostFromUsage', () => {
  it('prices gpt-5.6 luna usage with cached input tokens', () => {
    const estimate = estimateOpenAICostFromUsage({
      model: 'gpt-5.6-luna',
      usage: {
        inputTokens: 1000,
        cachedInputTokens: 100,
        cacheWriteTokens: 200,
        outputTokens: 2000,
        totalTokens: 3000,
      },
    });

    expect(estimate?.estimatedCostUsd).toBeCloseTo(0.01296);
  });

  it('prices gpt-5.4 mini usage with cached input tokens', () => {
    const estimate = estimateOpenAICostFromUsage({
      model: 'gpt-5.4-mini',
      usage: {
        inputTokens: 1000,
        cachedInputTokens: 100,
        cacheWriteTokens: 0,
        outputTokens: 2000,
        totalTokens: 3000,
      },
    });

    expect(estimate?.estimatedCostUsd).toBeCloseTo(0.0096825);
  });

  it('prices gpt-5.4 nano usage', () => {
    const estimate = estimateOpenAICostFromUsage({
      model: 'gpt-5.4-nano',
      usage: {
        inputTokens: 1000,
        cachedInputTokens: 100,
        cacheWriteTokens: 0,
        outputTokens: 2000,
        totalTokens: 3000,
      },
    });

    expect(estimate?.estimatedCostUsd).toBeCloseTo(0.002682);
  });
});

describe('OpenAIUsageCostTracker', () => {
  it('sums usage and cost across multiple responses', () => {
    const tracker = new OpenAIUsageCostTracker();

    tracker.add({
      model: 'gpt-5.4-mini',
      usage: {
        inputTokens: 1000,
        cachedInputTokens: 100,
        cacheWriteTokens: 0,
        outputTokens: 2000,
        totalTokens: 3000,
      },
    });
    tracker.add({
      model: 'gpt-5.4-mini',
      usage: {
        inputTokens: 3000,
        cachedInputTokens: 200,
        cacheWriteTokens: 0,
        outputTokens: 4000,
        totalTokens: 7000,
      },
    });

    const summary = tracker.summary();

    expect(summary.estimatedCostUsd).toBeCloseTo(0.0291975);
    expect(summary).toEqual({
      usage: {
        inputTokens: 4000,
        cachedInputTokens: 300,
        cacheWriteTokens: 0,
        outputTokens: 6000,
        totalTokens: 10000,
      },
      estimatedCostUsd: summary.estimatedCostUsd,
      modelsWithoutPricing: [],
    });
  });

  it('tracks models without configured pricing', () => {
    const tracker = new OpenAIUsageCostTracker();

    tracker.add({
      model: 'unknown-model',
      usage: {
        inputTokens: 1000,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 1000,
        totalTokens: 2000,
      },
    });

    expect(tracker.summary()).toEqual({
      usage: {
        inputTokens: 1000,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 1000,
        totalTokens: 2000,
      },
      estimatedCostUsd: null,
      modelsWithoutPricing: ['unknown-model'],
    });
  });
});
