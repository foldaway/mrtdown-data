# @mrtdown/triage

LLM-assisted evidence triage and replay utilities for MRTDown data.

Normal package builds and tests are deterministic. They must not call a model
provider.

## Commands

```bash
npm run build:triage
npm run test:triage
npm run triage:regressions -- --list
```

## Historical Regression Corpus

`fixtures/triage-regressions` contains checked-in cases derived from corrected,
rejected, and successful ingestion pull requests. Each case records its source
revision, normalized input, observed outcome, accepted semantic outcome, and
failure-taxonomy labels.

The corpus command is deterministic and read-only. It does not call a model or
write to canonical `data/`.

```bash
npm run triage:regressions -- --list
npm run triage:regressions -- --case pr-346-sklrt-reingest-effect
npm run triage:regressions -- --label relevance --json
OPENAI_API_KEY=... npm run triage:regressions -- \
  --case pr-346-sklrt-reingest-effect --replay
```

`--replay` is explicit because it makes paid model calls. It materializes the
recorded base revision into a temporary data root, runs current issue triage,
claim extraction, normalization, and impact computation, compares the result
with the semantic expectation, and deletes the temporary data afterward.
Cases whose historical base predates the current reader schemas may specify a
later `replayRevision` that preserves the observed bad state while keeping the
original source revisions as provenance.
Title generation, translation, persistence, and workflow replay remain separate
future work.

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

- `OPENAI_API_KEY`: OpenAI API key used by eval cases.

Model dependency:

- `extractClaimsFromNewEvidence` uses `gpt-5.4-mini`.
- `triageNewEvidence` uses `gpt-5.4-mini`.
- title/slug generation uses `gpt-5.4-nano`.
- translation uses `gpt-5.4-nano`.

Expected cost before running the checked-in eval set: less than USD 1 with the
current short fixtures. Revisit this estimate in the same PR when adding or
expanding eval cases.
