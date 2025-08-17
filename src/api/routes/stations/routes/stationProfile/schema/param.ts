import z from 'zod';

export const ParamSchema = z.object({
  stationId: z.string(),
});
