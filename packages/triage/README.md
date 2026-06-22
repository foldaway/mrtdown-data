# @mrtdown/triage

LLM-assisted evidence triage and replay utilities for MRTDown data.

Normal package builds and tests are deterministic. They must not call a model
provider.

## Commands

```bash
npm run build:triage
npm run test:triage
```

## Crowd Reports

Crowd reports enter triage through the shared
`@mrtdown/ingest-contracts` `crowd-report` content type. The site or another
producer must moderate reports before dispatching them here; this package does
not store submitter identity, abuse signals, queue state, or moderation notes.

Triage formats accepted reports into structured evidence text, maps them to
canonical `report.public` evidence, and stores the payload `url` as
`sourceUrl`. Single reports and accepted clusters use the same path. Producers
must set `reportCount` to `1` for a single accepted report, or to the accepted
cluster size for clustered reports. Confidence stays in the evidence text
through `reportCount`, `effect`, `delayMinutes`, and the producer-supplied
natural-language `text`; there is no separate canonical confidence field for
crowd reports.

Use `fixtures/ingest/crowd-report.json` as the lightweight manual fixture for
`workflow_dispatch` or local `MESSAGE` testing.

## Paid Eval

`test:eval` is reserved for model-dependent triage evaluation. It must not run
implicitly through `npm test`, `npm run test:packages`, or CI harness commands.

Required environment variables:

- `GEMINI_API_KEY`: Gemini API key used by eval cases.

Model dependency:

- `extractClaimsFromNewEvidence` uses `gemini-3-flash-preview`.
- `triageNewEvidence` uses `gemini-3-flash-preview`.
- title/slug generation uses `gemini-3.1-flash-lite`.
- translation uses `gemini-3.1-flash-lite`.

Expected cost before running the checked-in eval set: less than USD 1 with the
current short fixtures. Revisit this estimate in the same PR when adding or
expanding eval cases.
