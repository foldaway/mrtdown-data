type GeminiUsageLike =
  | {
      promptTokenCount?: number;
      cachedContentTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
      totalTokenCount?: number;
    }
  | null
  | undefined;

export type GeminiTokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  totalTokens: number;
};

export type GeminiUsageSummary = {
  usage: GeminiTokenUsage | null;
};

export function normalizeGeminiUsage(
  usage: GeminiUsageLike,
): GeminiTokenUsage | null {
  if (usage == null) {
    return null;
  }

  const inputTokens = usage.promptTokenCount ?? 0;
  const outputTokens = usage.candidatesTokenCount ?? 0;
  const thoughtTokens = usage.thoughtsTokenCount ?? 0;

  return {
    inputTokens,
    cachedInputTokens: usage.cachedContentTokenCount ?? 0,
    outputTokens,
    thoughtTokens,
    totalTokens:
      usage.totalTokenCount ?? inputTokens + outputTokens + thoughtTokens,
  };
}

export function sumGeminiTokenUsage(
  left: GeminiTokenUsage | null,
  right: GeminiTokenUsage | null,
): GeminiTokenUsage | null {
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
    thoughtTokens: left.thoughtTokens + right.thoughtTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

export class GeminiUsageTracker {
  private usage: GeminiTokenUsage | null = null;

  add(usage: GeminiTokenUsage | null) {
    this.usage = sumGeminiTokenUsage(this.usage, usage);
  }

  summary(): GeminiUsageSummary {
    return {
      usage: this.usage,
    };
  }
}

export function logGeminiUsageSummary({
  label,
  summary,
}: {
  label: string;
  summary: GeminiUsageSummary;
}) {
  if (summary.usage == null) {
    console.log(`[${label}] Gemini usage is unavailable`);
    return;
  }

  console.log(`[${label}] Gemini total usage:`, {
    inputTokens: summary.usage.inputTokens,
    cachedInputTokens: summary.usage.cachedInputTokens,
    outputTokens: summary.usage.outputTokens,
    thoughtTokens: summary.usage.thoughtTokens,
    totalTokens: summary.usage.totalTokens,
  });
}
