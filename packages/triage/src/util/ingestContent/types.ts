import type { z } from 'zod';

export * from '@mrtdown/ingest-contracts';

export type Tool<TParams = unknown> = {
  name: string;
  description: string;
  paramSchema: z.ZodType<TParams>;
  runner: (param: TParams) => Promise<string>;
};

export type ToolRegistry = Record<string, Tool>;
