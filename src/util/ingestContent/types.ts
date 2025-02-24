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
