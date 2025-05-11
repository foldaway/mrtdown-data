import { z } from 'zod';

export const ComponentIndexSchema = z.array(z.string());
export type ComponentIndex = z.infer<typeof ComponentIndexSchema>;
