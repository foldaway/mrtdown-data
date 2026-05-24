import { describe, expect, test } from 'vitest';
import {
  IngestContentCrowdReportEffectSchema,
  IngestContentCrowdReportEffects,
  IngestContentCrowdReportSource,
  IngestContentNewsArticleTextSourceSchema,
  IngestContentNewsArticleTextSources,
  IngestPayloadSchema,
} from './index.js';

describe('IngestPayloadSchema', () => {
  test('exports crowd report constants', () => {
    expect(IngestContentCrowdReportSource).toBe('crowd-report');
    expect(IngestContentCrowdReportEffectSchema.options).toEqual([
      ...IngestContentCrowdReportEffects,
    ]);
    expect(IngestContentCrowdReportEffectSchema.parse('crowding')).toBe(
      'crowding',
    );
  });

  test('exports news article text source constants', () => {
    expect(IngestContentNewsArticleTextSourceSchema.options).toEqual([
      ...IngestContentNewsArticleTextSources,
    ]);
    expect(IngestContentNewsArticleTextSourceSchema.parse('publisher')).toBe(
      'publisher',
    );
  });

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
            articleText:
              'Services are delayed due to a track fault. The operator said commuters should add 20 minutes of travel time.',
            articleTextSource: 'publisher',
            articleTextFetchedAt: '2026-05-23T09:03:00.000Z',
          },
          {
            source: 'crowd-report',
            reportId: 'accepted-20260523-0903-btl-001',
            text: 'Trains are skipping Bencoolen after a station announcement.',
            createdAt: '2026-05-23T09:04:00+08:00',
            observedAt: '2026-05-23T09:03:00+08:00',
            lineIds: ['BTL'],
            stationIds: ['BCL'],
            directionText: 'towards Expo',
            effect: 'skipped-stop',
            reportCount: 2,
            url: 'https://example.com/crowd-reports/accepted-20260523-0903-btl-001',
          },
        ],
      }),
    ).not.toThrow();
  });

  test('rejects unknown news article text sources', () => {
    expect(() =>
      IngestPayloadSchema.parse({
        content: [
          {
            source: 'news-website',
            title: 'Train service delayed',
            summary: 'Services are delayed due to a track fault.',
            url: 'https://example.com/news/1',
            createdAt: '2026-05-23T09:02:00+08:00',
            articleText:
              'Services are delayed due to a track fault. The operator said commuters should add 20 minutes of travel time.',
            articleTextSource: 'scraper',
            articleTextFetchedAt: '2026-05-23T09:03:00.000Z',
          },
        ],
      }),
    ).toThrow();
  });

  test('accepts crowd reports with optional cluster fields', () => {
    expect(() =>
      IngestPayloadSchema.parse({
        content: [
          {
            source: 'crowd-report',
            reportId: 'accepted-20260523-0903-btl-001',
            text: 'Several commuters report 15 minute delays on the BTL.',
            createdAt: '2026-05-23T09:04:00+08:00',
            observedAt: '2026-05-23T09:03:00+08:00',
            lineIds: ['BTL'],
            effect: 'delay',
            delayMinutes: 15,
            reportCount: 4,
            url: 'https://example.com/crowd-reports/accepted-20260523-0903-btl-001',
          },
        ],
      }),
    ).not.toThrow();
  });

  test('rejects crowd reports without affected lines or stations', () => {
    expect(() =>
      IngestPayloadSchema.parse({
        content: [
          {
            source: 'crowd-report',
            reportId: 'accepted-20260523-0903-btl-001',
            text: 'Several commuters report delays.',
            createdAt: '2026-05-23T09:04:00+08:00',
            observedAt: '2026-05-23T09:03:00+08:00',
            url: 'https://example.com/crowd-reports/accepted-20260523-0903-btl-001',
          },
        ],
      }),
    ).toThrow();
  });

  test('rejects site-local crowd report metadata', () => {
    expect(() =>
      IngestPayloadSchema.parse({
        content: [
          {
            source: 'crowd-report',
            reportId: 'accepted-20260523-0903-btl-001',
            text: 'Several commuters report delays.',
            createdAt: '2026-05-23T09:04:00+08:00',
            observedAt: '2026-05-23T09:03:00+08:00',
            lineIds: ['BTL'],
            url: 'https://example.com/crowd-reports/accepted-20260523-0903-btl-001',
            submitterEmail: 'commuter@example.com',
          },
        ],
      }),
    ).toThrow();
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
