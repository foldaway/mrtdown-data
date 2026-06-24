import { GoogleGenAI } from '@google/genai';

export function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey == null || apiKey.trim() === '') {
    throw new Error('GEMINI_API_KEY must be set before creating Gemini client');
  }

  return new GoogleGenAI({ apiKey });
}
