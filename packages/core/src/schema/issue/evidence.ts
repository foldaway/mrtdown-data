import z from 'zod';
import { TranslationsSchema } from '../common.js';

export const EvidenceTypeSchema = z.enum([
  'statement.official',
  'report.public',
  'report.media',
]);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

export const EvidenceRenderSchema = z.object({
  text: TranslationsSchema,
  source: z.string(),
});
export type EvidenceRender = z.infer<typeof EvidenceRenderSchema>;

export const EvidenceBaseSchema = z.object({
  id: z.string(),
  ts: z.string(),
  text: z.string(),
  render: EvidenceRenderSchema.nullable(),
});
export type EvidenceBase = z.infer<typeof EvidenceBaseSchema>;

export const EvidenceOfficialStatementSchema = EvidenceBaseSchema.extend({
  type: z.literal(EvidenceTypeSchema.enum['statement.official']),
  sourceUrl: z.string(),
});
export type EvidenceOfficialStatement = z.infer<
  typeof EvidenceOfficialStatementSchema
>;

export const EvidencePublicReportSchema = EvidenceBaseSchema.extend({
  type: z.literal(EvidenceTypeSchema.enum['report.public']),
  sourceUrl: z.string(),
});
export type EvidencePublicReport = z.infer<typeof EvidencePublicReportSchema>;

export const EvidenceMediaReportSchema = EvidenceBaseSchema.extend({
  type: z.literal(EvidenceTypeSchema.enum['report.media']),
  sourceUrl: z.string(),
});
export type EvidenceMediaReport = z.infer<typeof EvidenceMediaReportSchema>;

export const EvidenceSchema = z.discriminatedUnion('type', [
  EvidenceOfficialStatementSchema,
  EvidencePublicReportSchema,
  EvidenceMediaReportSchema,
]);
export type Evidence = z.infer<typeof EvidenceSchema>;
