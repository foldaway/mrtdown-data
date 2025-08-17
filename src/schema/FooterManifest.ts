import { z } from 'zod';
import { ComponentSchema } from './Component.js';
import { StationSchema } from './Station.js';

export const FooterManifestSchema = z.object({
  components: z.array(ComponentSchema),
  featuredStations: z.array(StationSchema),
  lastUpdatedAt: z.string().datetime(),
});
export type FooterManifest = z.infer<typeof FooterManifestSchema>;
