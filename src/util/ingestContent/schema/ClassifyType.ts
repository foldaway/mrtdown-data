import { z } from 'zod';

export const ClassifyTypeSchema = z.enum([
  'service-outage',
  'planned-maintenance',
  'infrastructure',
  'delay',
  'news',
  'discussion',
  'irrelevant',
]);
export type ClassifyType = z.infer<typeof ClassifyTypeSchema>;
