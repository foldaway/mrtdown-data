import { describe, expect, test } from 'vitest';
import { formatContentTextForIngest } from './formatContentTextForIngest.js';

describe('formatContentTextForIngest', () => {
  test('keeps news titles alongside summaries', () => {
    expect(
      formatContentTextForIngest({
        source: 'news-website',
        title: 'LTA investigating safety measures after death on LRT track',
        summary: 'A man reportedly fell in front of an oncoming train.',
        url: 'https://example.com/article',
        createdAt: '2026-05-22T14:07:24+08:00',
      }),
    ).toBe(
      'Title: LTA investigating safety measures after death on LRT track\n\nSummary: A man reportedly fell in front of an oncoming train.',
    );
  });

  test('uses news titles when summaries are empty', () => {
    expect(
      formatContentTextForIngest({
        source: 'news-website',
        title: 'Bukit Panjang LRT service resumes after track intrusion',
        summary: '',
        url: 'https://example.com/article',
        createdAt: '2026-05-18T07:11:00+08:00',
      }),
    ).toBe('Title: Bukit Panjang LRT service resumes after track intrusion');
  });

  test('includes enriched news article text when present', () => {
    expect(
      formatContentTextForIngest({
        source: 'news-website',
        title: 'Train service delayed',
        summary: 'Services are delayed due to a track fault.',
        url: 'https://example.com/article',
        createdAt: '2026-05-22T14:07:24+08:00',
        articleText:
          'Services are delayed due to a track fault. The operator said commuters should add 20 minutes of travel time.',
        articleTextSource: 'publisher',
        articleTextFetchedAt: '2026-05-22T06:08:00.000Z',
      }),
    ).toBe(
      [
        'Title: Train service delayed',
        'Summary: Services are delayed due to a track fault.',
        'Article text: Services are delayed due to a track fault. The operator said commuters should add 20 minutes of travel time.',
        'Article text source: publisher',
      ].join('\n\n'),
    );
  });

  test('keeps reddit titles alongside body text', () => {
    expect(
      formatContentTextForIngest({
        source: 'reddit',
        subreddit: 'singapore',
        title: 'Major delay on Bukit Panjang LRT',
        selftext: 'No service between Senja and Petir.',
        url: 'https://example.com/reddit',
        createdAt: '2026-05-18T06:52:25+08:00',
        thumbnailUrl: null,
      }),
    ).toBe(
      'Title: Major delay on Bukit Panjang LRT\n\nBody: No service between Senja and Petir.',
    );
  });

  test('formats accepted crowd reports as structured evidence', () => {
    expect(
      formatContentTextForIngest({
        source: 'crowd-report',
        reportId: 'accepted-20260523-0903-dtl-001',
        text: 'Several commuters report 15 minute delays on the DTL.',
        createdAt: '2026-05-23T09:04:00+08:00',
        observedAt: '2026-05-23T09:03:00+08:00',
        lineIds: ['DTL'],
        stationIds: ['BCL'],
        directionText: 'towards Expo',
        effect: 'delay',
        delayMinutes: 15,
        reportCount: 4,
        url: 'https://www.mrtdown.org/crowd-reports/accepted-20260523-0903-dtl-001',
      }),
    ).toBe(
      [
        'Report: Several commuters report 15 minute delays on the DTL.',
        'Observed at: 2026-05-23T09:03:00+08:00',
        'Accepted at: 2026-05-23T09:04:00+08:00',
        'Lines: DTL',
        'Stations: BCL',
        'Direction: towards Expo',
        'Effect: delay',
        'Delay minutes: 15',
        'Report count: 4',
      ].join('\n\n'),
    );
  });

  test('formats single crowd reports with report count one', () => {
    expect(
      formatContentTextForIngest({
        source: 'crowd-report',
        reportId: 'accepted-20260523-0910-ewl-001',
        text: 'Train held at Outram Park for several minutes.',
        createdAt: '2026-05-23T09:11:00+08:00',
        observedAt: '2026-05-23T09:10:00+08:00',
        lineIds: ['EWL'],
        stationIds: ['OTP'],
        effect: 'unknown',
        reportCount: 1,
        url: 'https://www.mrtdown.org/crowd-reports/accepted-20260523-0910-ewl-001',
      }),
    ).toBe(
      [
        'Report: Train held at Outram Park for several minutes.',
        'Observed at: 2026-05-23T09:10:00+08:00',
        'Accepted at: 2026-05-23T09:11:00+08:00',
        'Lines: EWL',
        'Stations: OTP',
        'Effect: unknown',
        'Report count: 1',
      ].join('\n\n'),
    );
  });
});
