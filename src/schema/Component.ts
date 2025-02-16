import { z } from 'zod';

export const ComponentIdSchema = z
  .string()
  .refine((val) => /^[A-Z]{3,10}$/.test(val));
export type ComponentId = z.infer<typeof ComponentIdSchema>;

export const ComponentSchema = z.object({
  id: ComponentIdSchema,
  title: z.string(),
  color: z.string().refine((val) => /^#([A-Fa-f0-9]{6})/.test(val)),
  startedAt: z.string().date(),
});
export type Component = z.infer<typeof ComponentSchema>;
