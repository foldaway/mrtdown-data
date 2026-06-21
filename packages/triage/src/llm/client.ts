import OpenAI from 'openai';

export type OpenAIRetryOptions = {
  label: string;
  maxAttempts?: number;
  initialDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export function getOpenAiClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey == null || apiKey.trim() === '') {
    throw new Error('OPENAI_API_KEY must be set before creating OpenAI client');
  }

  return new OpenAI({
    apiKey,
  });
}

export async function runOpenAIRequestWithRetry<T>(
  request: () => Promise<T>,
  {
    label,
    maxAttempts = 4,
    initialDelayMs = 500,
    sleep = sleepMs,
  }: OpenAIRetryOptions,
): Promise<T> {
  let attempt = 1;

  while (true) {
    try {
      return await request();
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableOpenAIError(error)) {
        throw error;
      }

      const delayMs = initialDelayMs * 2 ** (attempt - 1);
      console.warn(
        `${label}: OpenAI request failed with a retryable error; retrying attempt ${attempt + 1}/${maxAttempts} in ${delayMs}ms.`,
      );

      await sleep(delayMs);
      attempt++;
    }
  }
}

export function isRetryableOpenAIError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') {
    return false;
  }

  const status = getNumericProperty(error, 'status');
  if (status != null) {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }

  const code = getStringProperty(error, 'code');
  return (
    code === 'server_error' ||
    code === 'rate_limit_exceeded' ||
    code === 'timeout'
  );
}

function getNumericProperty(value: object, key: string): number | null {
  if (!(key in value)) {
    return null;
  }

  const property = value[key as keyof typeof value];
  return typeof property === 'number' ? property : null;
}

function getStringProperty(value: object, key: string): string | null {
  if (!(key in value)) {
    return null;
  }

  const property = value[key as keyof typeof value];
  return typeof property === 'string' ? property : null;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
