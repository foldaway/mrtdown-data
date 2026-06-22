type ResponsesUsageLike =
  | {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      input_tokens_details?: {
        cached_tokens?: number;
      } | null;
    }
  | null
  | undefined;

type ChatCompletionUsageLike =
  | {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      prompt_tokens_details?: {
        cached_tokens?: number;
      } | null;
    }
  | null
  | undefined;

export type OpenAITokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type OpenAIModelPricing = {
  inputUsdPer1MTokens: number;
  cachedInputUsdPer1MTokens: number;
  outputUsdPer1MTokens: number;
};

export type OpenAIUsageCostSummary = {
  usage: OpenAITokenUsage | null;
  estimatedCostUsd: number | null;
  modelsWithoutPricing: string[];
};

export const OPENAI_MODEL_PRICING: Record<string, OpenAIModelPricing> = {
  'gpt-5.4': {
    inputUsdPer1MTokens: 2.5,
    cachedInputUsdPer1MTokens: 0.25,
    outputUsdPer1MTokens: 15,
  },
  'gpt-5.4-mini': {
    inputUsdPer1MTokens: 0.75,
    cachedInputUsdPer1MTokens: 0.075,
    outputUsdPer1MTokens: 4.5,
  },
  'gpt-5.4-nano': {
    inputUsdPer1MTokens: 0.2,
    cachedInputUsdPer1MTokens: 0.02,
    outputUsdPer1MTokens: 1.25,
  },
};

export function normalizeOpenAIResponsesUsage(
  usage: ResponsesUsageLike,
): OpenAITokenUsage | null {
  if (usage == null) {
    return null;
  }

  return {
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
  };
}

export function normalizeOpenAIChatCompletionUsage(
  usage: ChatCompletionUsageLike,
): OpenAITokenUsage | null {
  if (usage == null) {
    return null;
  }

  return {
    inputTokens: usage.prompt_tokens,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

export function estimateOpenAICostFromUsage({
  model,
  usage,
  pricingByModel = OPENAI_MODEL_PRICING,
}: {
  model: string;
  usage: OpenAITokenUsage | null;
  pricingByModel?: Record<string, OpenAIModelPricing>;
}) {
  if (usage == null) {
    return null;
  }

  const pricing = pricingByModel[model];
  if (pricing == null) {
    return null;
  }

  const cachedInputTokens = Math.max(usage.cachedInputTokens, 0);
  const uncachedInputTokens = Math.max(
    usage.inputTokens - cachedInputTokens,
    0,
  );
  const outputTokens = Math.max(usage.outputTokens, 0);

  const estimatedCostUsd =
    (uncachedInputTokens / 1_000_000) * pricing.inputUsdPer1MTokens +
    (cachedInputTokens / 1_000_000) * pricing.cachedInputUsdPer1MTokens +
    (outputTokens / 1_000_000) * pricing.outputUsdPer1MTokens;

  return {
    estimatedCostUsd,
    usage,
    pricing,
  };
}

export function sumOpenAITokenUsage(
  left: OpenAITokenUsage | null,
  right: OpenAITokenUsage | null,
): OpenAITokenUsage | null {
  if (left == null) {
    return right;
  }
  if (right == null) {
    return left;
  }

  return {
    inputTokens: left.inputTokens + right.inputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

export class OpenAIUsageCostTracker {
  private usage: OpenAITokenUsage | null = null;
  private estimatedCostUsd = 0;
  private readonly modelsWithoutPricing = new Set<string>();

  add({ model, usage }: { model: string; usage: OpenAITokenUsage | null }) {
    if (usage == null) {
      return;
    }

    this.usage = sumOpenAITokenUsage(this.usage, usage);

    const estimate = estimateOpenAICostFromUsage({ model, usage });
    if (estimate == null) {
      this.modelsWithoutPricing.add(model);
      return;
    }

    this.estimatedCostUsd += estimate.estimatedCostUsd;
  }

  summary(): OpenAIUsageCostSummary {
    return {
      usage: this.usage,
      estimatedCostUsd:
        this.modelsWithoutPricing.size === 0 ? this.estimatedCostUsd : null,
      modelsWithoutPricing: [...this.modelsWithoutPricing].sort(),
    };
  }
}

export function logOpenAIUsageCostSummary({
  label,
  summary,
}: {
  label: string;
  summary: OpenAIUsageCostSummary;
}) {
  if (summary.usage == null) {
    console.log(`[${label}] Usage is unavailable`);
    return;
  }

  console.log(`[${label}] Total usage:`, {
    inputTokens: summary.usage.inputTokens,
    cachedInputTokens: summary.usage.cachedInputTokens,
    outputTokens: summary.usage.outputTokens,
    totalTokens: summary.usage.totalTokens,
  });

  if (summary.estimatedCostUsd != null) {
    console.log(
      `[${label}] Total estimated cost (USD):`,
      summary.estimatedCostUsd.toFixed(8),
    );
    return;
  }

  console.log(
    `[${label}] No pricing configured for model(s): ${summary.modelsWithoutPricing.join(', ')}`,
  );
}
