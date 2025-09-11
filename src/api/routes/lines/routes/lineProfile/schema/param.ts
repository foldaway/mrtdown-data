import z from 'zod';

export const ParamSchema = z.object({
  lineId: z.string().regex(/^[A-Z]{3,10}$/, { message: "lineId must be 3-10 uppercase letters" }),
});
