type ResponsesUsageLike = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: {
    cached_tokens?: number;
  } | null;
} | null | undefined;

type ChatCompletionUsageLike = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  } | null;
} | null | undefined;

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

export const OPENAI_MODEL_PRICING: Record<string, OpenAIModelPricing> = {
  'gpt-5-mini': {
    inputUsdPer1MTokens: 0.25,
    cachedInputUsdPer1MTokens: 0.025,
    outputUsdPer1MTokens: 2,
  },
  'gpt-5-nano': {
    inputUsdPer1MTokens: 0.05,
    cachedInputUsdPer1MTokens: 0.005,
    outputUsdPer1MTokens: 0.4,
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
  const uncachedInputTokens = Math.max(usage.inputTokens - cachedInputTokens, 0);
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
