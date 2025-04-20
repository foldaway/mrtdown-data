import { z } from 'zod';

export const StationTranslatedNamesSchema = z.record(z.string(), z.string());
export type StationTranslatedNames = z.infer<
  typeof StationTranslatedNamesSchema
>;
