import OpenAI from 'openai';

export function getOpenAiClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey == null || apiKey.trim() === '') {
    throw new Error('OPENAI_API_KEY must be set before creating OpenAI client');
  }

  return new OpenAI({
    apiKey,
  });
}
