import { z } from 'zod';

export const StationIdSchema = z
  .string()
  .refine((val) => /^[A-Z]{2,5}$/.test(val));
