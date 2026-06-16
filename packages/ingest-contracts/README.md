# @mrtdown/ingest-contracts

Shared Zod schemas and TypeScript types for MRTDown ingest webhook payloads.

This package is intentionally small so external evidence producers can validate
payloads without depending on `@mrtdown/triage` or its LLM/runtime
implementation dependencies.

```ts
import {
  IngestPayloadSchema,
  type IngestPayload,
} from '@mrtdown/ingest-contracts';

const payload: IngestPayload = IngestPayloadSchema.parse({
  content: [
    {
      source: 'news-website',
      title: 'Example disruption report',
      summary: 'Trains are delayed due to a track fault.',
      url: 'https://example.com/report',
      createdAt: '2026-05-23T09:00:00+08:00',
      articleText:
        'The operator said commuters should expect an additional 20 minutes of travel time.',
      articleTextSource: 'publisher',
      articleTextFetchedAt: '2026-05-23T09:01:00.000Z',
    },
  ],
});
```

## News Articles

News website payloads may include optional article enrichment fields from
crawler-side extraction:

- `articleText` is extracted article body text, or a compact metadata fallback.
- `articleTextSource` is `publisher`, `archive`, or `metadata`.
- `articleTextFetchedAt` is when the article text was fetched or derived.

## Crowd Reports

Accepted and moderated public commuter reports use the `crowd-report` content
source. These payloads are intended for reports that are already safe to become
canonical evidence.

```ts
const payload: IngestPayload = IngestPayloadSchema.parse({
  content: [
    {
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
      url: 'https://example.com/crowd-reports/accepted-20260523-0903-dtl-001',
    },
  ],
});
```

`IngestContentCrowdReportEffectSchema`,
`IngestContentCrowdReportEffects`, and
`IngestContentCrowdReportSource` are exported for producers that need to share
the crowd-report source and effect values.

Contract rules:

- `reportId` must be stable and non-PII.
- `createdAt` is an ISO 8601 datetime with timezone offset for when the
  producer accepted the report or cluster for dispatch.
- `observedAt` is an ISO 8601 datetime with timezone offset for when the
  condition was observed. It must not be later than `createdAt`.
- `text` is the natural-language evidence passed to triage.
- At least one `lineIds` or `stationIds` entry is required.
- `reportCount` is required; use `1` for a single accepted report and a larger
  count for an accepted cluster.
- `url` is required because canonical evidence stores a public `sourceUrl`.
  It must be an HTTP(S) URL.
- Site-local metadata is rejected. Keep submitter identities, IP addresses,
  user-agent strings, contact fields, moderation notes, abuse scores, and
  challenge tokens out of this payload.

The checked-in sample at `fixtures/ingest/crowd-report.json` is valid against
`IngestPayloadSchema` and can be pasted into the ingest workflow's manual
`payload` input for an end-to-end dispatch trial.
