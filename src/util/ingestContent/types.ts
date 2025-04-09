import type { z } from 'zod';

export type IngestContentTwitter = {
  source: 'twitter' | 'mastodon';
  accountName: string;
  text: string;
  url: string;
  createdAt: string;
};

export type IngestContentReddit = {
  source: 'reddit';
  subreddit: string;
  title: string;
  selftext: string;
  url: string;
  createdAt: string;
  thumbnailUrl: string | null;
};

export type IngestContentNewsArticle = {
  source: 'news-website';
  title: string;
  summary: string;
  url: string;
  createdAt: string;
};

export type IngestContent =
  | IngestContentTwitter
  | IngestContentReddit
  | IngestContentNewsArticle;

export type Tool<TParams = any> = {
  name: string;
  description: string;
  paramSchema: z.ZodSchema<TParams>;
  runner: (param: TParams) => Promise<string>;
};

export type ToolRegistry = Record<string, Tool>;
