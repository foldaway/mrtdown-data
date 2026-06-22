import OpenAI from 'openai';

export type OpenAIRetryOptions = {
  label: string;
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
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
    maxAttempts = 6,
    initialDelayMs = 1_000,
    maxDelayMs = 30_000,
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

      const delayMs =
        getRetryAfterDelayMs(error, maxDelayMs) ??
        Math.min(maxDelayMs, initialDelayMs * 2 ** (attempt - 1));
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

function getRetryAfterDelayMs(
  error: unknown,
  maxDelayMs: number,
): number | null {
  if (error == null || typeof error !== 'object' || !('headers' in error)) {
    return null;
  }

  const headers = error.headers;
  const retryAfterMs = parseNumericHeader(
    getHeaderValue(headers, 'retry-after-ms'),
  );
  if (retryAfterMs != null) {
    return Math.min(maxDelayMs, retryAfterMs);
  }

  const retryAfter = getHeaderValue(headers, 'retry-after');
  if (retryAfter == null) {
    return null;
  }

  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(maxDelayMs, retryAfterSeconds * 1_000);
  }

  const retryAfterDate = Date.parse(retryAfter);
  if (Number.isNaN(retryAfterDate)) {
    return null;
  }

  return Math.min(maxDelayMs, Math.max(0, retryAfterDate - Date.now()));
}

function getHeaderValue(headers: unknown, key: string): string | null {
  if (headers == null || typeof headers !== 'object') {
    return null;
  }

  if ('get' in headers && typeof headers.get === 'function') {
    const value = headers.get(key);
    return typeof value === 'string' ? value : null;
  }

  for (const [headerKey, headerValue] of Object.entries(headers)) {
    if (headerKey.toLowerCase() !== key) {
      continue;
    }

    if (typeof headerValue === 'string') {
      return headerValue;
    }
  }

  return null;
}

function parseNumericHeader(value: string | null): number | null {
  if (value == null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
