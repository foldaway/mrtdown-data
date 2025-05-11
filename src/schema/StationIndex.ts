import { z } from 'zod';

export const StationIndexSchema = z.array(z.string());
export type StationIndex = z.infer<typeof StationIndexSchema>;
