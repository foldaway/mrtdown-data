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
    },
  ],
});
```
