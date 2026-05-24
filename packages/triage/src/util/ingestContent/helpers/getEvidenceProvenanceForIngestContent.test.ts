import { describe, expect, test } from 'vitest';
import { getEvidenceProvenanceForIngestContent } from './getEvidenceProvenanceForIngestContent.js';

describe('getEvidenceProvenanceForIngestContent', () => {
  test('maps crowd reports to public report evidence and keeps the source URL', () => {
    expect(
      getEvidenceProvenanceForIngestContent({
        source: 'crowd-report',
        reportId: 'accepted-20260523-0903-btl-001',
        text: 'Several commuters report 15 minute delays on the BTL.',
        createdAt: '2026-05-23T09:04:00+08:00',
        observedAt: '2026-05-23T09:03:00+08:00',
        lineIds: ['BTL'],
        url: 'https://example.com/crowd-reports/accepted-20260523-0903-btl-001',
      }),
    ).toEqual({
      type: 'report.public',
      sourceUrl:
        'https://example.com/crowd-reports/accepted-20260523-0903-btl-001',
    });
  });

  test('keeps news website content as media report evidence', () => {
    expect(
      getEvidenceProvenanceForIngestContent({
        source: 'news-website',
        title: 'Train service delayed',
        summary: 'Services are delayed due to a track fault.',
        url: 'https://example.com/news/1',
        createdAt: '2026-05-23T09:02:00+08:00',
      }),
    ).toEqual({
      type: 'report.media',
      sourceUrl: 'https://example.com/news/1',
    });
  });
});
