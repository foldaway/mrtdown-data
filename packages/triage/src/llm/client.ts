import OpenAI from 'openai';

export function getOpenAiClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_AI_KEY,
  });
}
