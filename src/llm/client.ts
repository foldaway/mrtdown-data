import OpenAI from 'openai';

export const openAiClient = new OpenAI({
  apiKey: process.env.OPENAI_AI_KEY,
});
