import z from 'zod';

export const IssueTypeSchema = z.enum(['disruption', 'maintenance', 'infra']);
export type IssueType = z.infer<typeof IssueTypeSchema>;
