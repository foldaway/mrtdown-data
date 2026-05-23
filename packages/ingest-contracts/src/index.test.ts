import { describe, expect, test } from 'vitest';
import { IngestPayloadSchema } from './index.js';

describe('IngestPayloadSchema', () => {
  test('accepts supported ingest content sources', () => {
    expect(() =>
      IngestPayloadSchema.parse({
        content: [
          {
            source: 'twitter',
            accountName: 'SMRT_Singapore',
            text: 'Train service is delayed.',
            url: 'https://example.com/status/1',
            createdAt: '2026-05-23T09:00:00+08:00',
          },
          {
            source: 'reddit',
            subreddit: 'singapore',
            title: 'MRT delay',
            selftext: 'There is a delay on the line.',
            url: 'https://example.com/r/1',
            createdAt: '2026-05-23T09:01:00+08:00',
            thumbnailUrl: null,
          },
          {
            source: 'news-website',
            title: 'Train service delayed',
            summary: 'Services are delayed due to a track fault.',
            url: 'https://example.com/news/1',
            createdAt: '2026-05-23T09:02:00+08:00',
          },
        ],
      }),
    ).not.toThrow();
  });

  test('rejects unknown content sources', () => {
    expect(() =>
      IngestPayloadSchema.parse({
        content: [
          {
            source: 'blog',
            title: 'Train service delayed',
            url: 'https://example.com/blog/1',
            createdAt: '2026-05-23T09:02:00+08:00',
          },
        ],
      }),
    ).toThrow();
  });
});
