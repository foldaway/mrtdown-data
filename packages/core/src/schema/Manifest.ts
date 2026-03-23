import z from 'zod';

export const ManifestSchema = z.object({
  manifestVersion: z.number(),
  generatedAt: z.string(),
  lines: z.record(z.string(), z.string()),
  stations: z.record(z.string(), z.string()),
  towns: z.record(z.string(), z.string()),
  landmarks: z.record(z.string(), z.string()),
  operators: z.record(z.string(), z.string()),
  services: z.record(z.string(), z.string()),
  issues: z.record(z.string(), z.string()),
});
export type Manifest = z.infer<typeof ManifestSchema>;
