import { z } from 'zod';

export const IngestContentTwitterSchema = z.object({
  source: z.union([z.literal('twitter'), z.literal('mastodon')]),
  accountName: z.string(),
  text: z.string(),
  url: z.string(),
  createdAt: z.string(),
});

export type IngestContentTwitter = z.infer<typeof IngestContentTwitterSchema>;

export const IngestContentRedditSchema = z.object({
  source: z.literal('reddit'),
  subreddit: z.string(),
  title: z.string(),
  selftext: z.string(),
  url: z.string(),
  createdAt: z.string(),
  thumbnailUrl: z.string().nullable(),
});

export type IngestContentReddit = z.infer<typeof IngestContentRedditSchema>;

export const IngestContentNewsArticleTextSources = [
  'publisher',
  'archive',
  'metadata',
] as const;

export const IngestContentNewsArticleTextSourceSchema = z.enum(
  IngestContentNewsArticleTextSources,
);

export type IngestContentNewsArticleTextSource = z.infer<
  typeof IngestContentNewsArticleTextSourceSchema
>;

export const IngestContentNewsArticleSchema = z.object({
  source: z.literal('news-website'),
  title: z.string(),
  summary: z.string(),
  url: z.string(),
  createdAt: z.string(),
  articleText: z.string().min(1).optional(),
  articleTextSource: IngestContentNewsArticleTextSourceSchema.optional(),
  articleTextFetchedAt: z.string().optional(),
});

export type IngestContentNewsArticle = z.infer<
  typeof IngestContentNewsArticleSchema
>;

export const IngestContentCrowdReportSource = 'crowd-report';
export type IngestContentCrowdReportSource =
  typeof IngestContentCrowdReportSource;

export const IngestContentCrowdReportEffects = [
  'delay',
  'no-service',
  'crowding',
  'skipped-stop',
  'unknown',
] as const;

export const IngestContentCrowdReportEffectSchema = z.enum(
  IngestContentCrowdReportEffects,
);
export type IngestContentCrowdReportEffect = z.infer<
  typeof IngestContentCrowdReportEffectSchema
>;

const IngestContentCrowdReportTimestampSchema = z.iso.datetime({
  offset: true,
});

const IngestContentCrowdReportUrlSchema = z.url().refine(
  (value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  },
  { message: 'Expected an HTTP(S) URL' },
);

export const IngestContentCrowdReportSchema = z
  .object({
    source: z.literal(IngestContentCrowdReportSource),
    reportId: z.string().min(1),
    text: z.string().min(1),
    createdAt: IngestContentCrowdReportTimestampSchema,
    observedAt: IngestContentCrowdReportTimestampSchema,
    lineIds: z.array(z.string().min(1)).optional(),
    stationIds: z.array(z.string().min(1)).optional(),
    directionText: z.string().optional(),
    effect: IngestContentCrowdReportEffectSchema.optional(),
    delayMinutes: z.number().int().nonnegative().optional(),
    reportCount: z.number().int().positive(),
    url: IngestContentCrowdReportUrlSchema,
  })
  .strict()
  .refine(
    (content) =>
      (content.lineIds != null && content.lineIds.length > 0) ||
      (content.stationIds != null && content.stationIds.length > 0),
    {
      message: 'Expected at least one lineIds or stationIds entry',
      path: ['lineIds'],
    },
  )
  .refine(
    (content) =>
      Date.parse(content.observedAt) <= Date.parse(content.createdAt),
    {
      message: 'Expected observedAt to be before or equal to createdAt',
      path: ['observedAt'],
    },
  );

export type IngestContentCrowdReport = z.infer<
  typeof IngestContentCrowdReportSchema
>;

export const IngestContentSchema = z.union([
  IngestContentTwitterSchema,
  IngestContentRedditSchema,
  IngestContentNewsArticleSchema,
  IngestContentCrowdReportSchema,
]);

export type IngestContent = z.infer<typeof IngestContentSchema>;

export const IngestPayloadSchema = z.object({
  content: z.array(IngestContentSchema),
});

export type IngestPayload = z.infer<typeof IngestPayloadSchema>;

export const IngestMessageSchema = IngestPayloadSchema;
export type IngestMessage = IngestPayload;
