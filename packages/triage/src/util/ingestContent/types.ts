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

export const IngestContentNewsArticleSchema = z.object({
  source: z.literal('news-website'),
  title: z.string(),
  summary: z.string(),
  url: z.string(),
  createdAt: z.string(),
});

export type IngestContentNewsArticle = z.infer<
  typeof IngestContentNewsArticleSchema
>;

export const IngestContentSchema = z.union([
  IngestContentTwitterSchema,
  IngestContentRedditSchema,
  IngestContentNewsArticleSchema,
]);

export type IngestContent = z.infer<typeof IngestContentSchema>;

export const IngestMessageSchema = z.object({
  content: z.array(IngestContentSchema),
});

export type Tool<TParams = unknown> = {
  name: string;
  description: string;
  paramSchema: z.ZodType<TParams>;
  runner: (param: TParams) => Promise<string>;
};

export type ToolRegistry = Record<string, Tool>;
