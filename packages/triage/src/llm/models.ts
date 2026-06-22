export const GEMINI_TRIAGE_MODEL = 'gemini-3-flash-preview';
export const GEMINI_FAST_MODEL = 'gemini-3.1-flash-lite';

export function modelSource(model: string) {
  return `@google/${model}`;
}
