import { z } from 'zod';
import { ComponentSchema } from './Component';
import { StationSchema } from './Station';

export const FooterManifestSchema = z.object({
  components: z.array(ComponentSchema),
  featuredStations: z.array(StationSchema),
  lastUpdatedAt: z.string().datetime(),
});
export type FooterManifest = z.infer<typeof FooterManifestSchema>;
