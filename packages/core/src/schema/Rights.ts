import z from 'zod';
import { EvidenceTypeSchema } from './issue/evidence.js';

export const SourceRightsCategorySchema = z.enum([
  'mrtdown-authored',
  'sg-open-data',
  'platform-post',
  'news-publication',
  'crowd-report',
  'generic-web',
  'unknown-third-party',
]);
export type SourceRightsCategory = z.infer<typeof SourceRightsCategorySchema>;

export const RightsPolicySchema = z.enum([
  'mrtdown-authored-public-data',
  'preserve-upstream-open-data-notice',
  'third-party-content-not-licensed-by-mrtdown',
  'direct-crowd-report-inbound-terms-required',
  'block-publication-until-resolved',
]);
export type RightsPolicy = z.infer<typeof RightsPolicySchema>;

export const RightsIdSchema = z.string().min(1);
export type RightsId = z.infer<typeof RightsIdSchema>;

export const RightsDefinitionSchema = z.object({
  id: RightsIdSchema,
  label: z.string().min(1),
  url: z.url().nullable(),
  category: SourceRightsCategorySchema,
  summary: z.string().min(1),
});
export type RightsDefinition = z.infer<typeof RightsDefinitionSchema>;

export const SourceRegistryRuleMatchSchema = z
  .object({
    sourceUrlHost: z.array(z.string().min(1)).min(1).optional(),
    sourceUrlPathPrefix: z.array(z.string().min(1)).min(1).optional(),
    evidenceType: z.array(EvidenceTypeSchema).min(1).optional(),
  })
  .refine(
    (match) =>
      match.sourceUrlHost != null ||
      match.sourceUrlPathPrefix != null ||
      match.evidenceType != null,
    {
      message:
        'At least one of sourceUrlHost, sourceUrlPathPrefix, or evidenceType is required',
    },
  );
export type SourceRegistryRuleMatch = z.infer<
  typeof SourceRegistryRuleMatchSchema
>;

export const SourceRegistryRuleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  match: SourceRegistryRuleMatchSchema,
  priority: z.number().int().optional(),
  category: SourceRightsCategorySchema,
  contentRights: RightsIdSchema,
  mrtdownRights: RightsIdSchema,
  policy: RightsPolicySchema,
  attributionTemplate: z.string().min(1),
  publicExportAllowed: z.boolean(),
});
export type SourceRegistryRule = z.infer<typeof SourceRegistryRuleSchema>;

export const SourceRegistrySchema = z
  .object({
    schemaVersion: z.literal(1),
    rights: z.array(RightsDefinitionSchema).min(1),
    rules: z.array(SourceRegistryRuleSchema).min(1),
  })
  .superRefine((registry, context) => {
    const rightsIds = new Set<string>();
    for (const [index, right] of registry.rights.entries()) {
      if (rightsIds.has(right.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate rights id ${right.id}`,
          path: ['rights', index, 'id'],
        });
      }
      rightsIds.add(right.id);
    }

    const ruleIds = new Set<string>();
    for (const [index, rule] of registry.rules.entries()) {
      if (ruleIds.has(rule.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate source registry rule id ${rule.id}`,
          path: ['rules', index, 'id'],
        });
      }
      ruleIds.add(rule.id);

      for (const rightsKey of ['contentRights', 'mrtdownRights'] as const) {
        if (!rightsIds.has(rule[rightsKey])) {
          context.addIssue({
            code: 'custom',
            message: `Unknown rights id ${rule[rightsKey]}`,
            path: ['rules', index, rightsKey],
          });
        }
      }
    }
  });
export type SourceRegistry = z.infer<typeof SourceRegistrySchema>;

export const ResolvedAttributionEntrySchema = z.object({
  evidenceId: z.string(),
  issueId: z.string(),
  sourceUrl: z.string(),
  sourceRuleId: z.string(),
  contentRights: RightsIdSchema,
  mrtdownRights: RightsIdSchema,
  policy: RightsPolicySchema,
  attribution: z.string().min(1),
});
export type ResolvedAttributionEntry = z.infer<
  typeof ResolvedAttributionEntrySchema
>;

export const AttributionSourceRuleSummarySchema = z.object({
  sourceRuleId: z.string(),
  label: z.string(),
  category: SourceRightsCategorySchema,
  contentRights: RightsIdSchema,
  mrtdownRights: RightsIdSchema,
  policy: RightsPolicySchema,
  attributionTemplate: z.string(),
  evidenceCount: z.number().int().nonnegative(),
});
export type AttributionSourceRuleSummary = z.infer<
  typeof AttributionSourceRuleSummarySchema
>;

export const AttributionIndexSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  dataLicense: RightsIdSchema,
  thirdPartyNotice: z.literal(
    'third-party-source-content-not-licensed-by-mrtdown',
  ),
  sourceRules: z.array(AttributionSourceRuleSummarySchema),
  entries: z.array(ResolvedAttributionEntrySchema),
});
export type AttributionIndex = z.infer<typeof AttributionIndexSchema>;
