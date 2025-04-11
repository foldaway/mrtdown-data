import { z } from 'zod';

export const StationIndexSchema = z.record(z.string(), z.array(z.string()));
export type StationIndex = z.infer<typeof StationIndexSchema>;
