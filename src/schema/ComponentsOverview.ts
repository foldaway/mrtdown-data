import { z } from 'zod';
import { ComponentSchema } from './Component';
import { IssueIdSchema, IssueTypeSchema } from './Issue';

export const IssueReferenceSchema = z.object({
  id: IssueIdSchema,
  title: z.string(),
});
export type IssueReference = z.infer<typeof IssueReferenceSchema>;

export const COEntryDateOverviewSchema = z.object({
  issueTypesDurationMs: z.record(IssueTypeSchema, z.number()),
  issues: z.array(IssueReferenceSchema),
});
export type COEntryDateOverview = z.infer<typeof COEntryDateOverviewSchema>;

export const COEntrySchema = z.object({
  component: ComponentSchema,
  dates: z.record(z.string().date(), COEntryDateOverviewSchema),
});
export type COEntry = z.infer<typeof COEntrySchema>;

export const ComponentsOverviewSchema = z.object({
  entries: z.array(COEntrySchema),
});
export type ComponentsOverview = z.infer<typeof ComponentsOverviewSchema>;
