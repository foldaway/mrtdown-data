# Crowdsourced reports canonical ingestion

Completed implementation record, verified on 2026-06-17. Current producer
payloads live in the [ingest contract guide](../../../packages/ingest-contracts/README.md#crowd-reports);
current processing and workflow behavior live in the
[triage guide](../../../packages/triage/README.md#crowd-reports).

## Delivered outcome

Accepted reports and clusters use the shared `crowd-report` payload and ordinary
triage path to create canonical `report.public` evidence. The checked-in
`fixtures/ingest/crowd-report.json` supports producer and manual workflow testing.
The data repository does not own report collection, moderation, abuse controls,
submitter identity, or short-lived community signals; those remain site-local.

The [original plan](https://github.com/foldaway/mrtdown-data/blob/f4f0412c23d56207f60929f4c06b605cf1974295/docs/plans/completed/crowdsourced-reports.md)
retains the cross-repository diagram and initial payload/phase design. Use the
package guides and schemas for the maintained contract, not that historical copy.

## Decisions retained

- 2026-05-24: Only accepted reports enter canonical evidence. Reuse the ingest
  contract and triage pipeline instead of adding a separate canonical writer.
- 2026-06-15: Keep confidence and cluster context in evidence text through
  `reportCount`, effect, delay, and the supplied text. Do not add a separate
  canonical confidence field without a demonstrated need.
- Keep personal details, moderation state, abuse scores, and challenge tokens
  out of the public contract. Public URLs must be safe to retain as source evidence.
- Paid evals remain intentional; extend them when observed behavior justifies it.

## Verification history

- 2026-05-24: Added shared payload schemas, deterministic formatting, and public
  report evidence mapping.
- 2026-06-13: Added the manual fixture and deterministic `ingestContent` coverage
  proving canonical evidence and impacts through the existing path.
- 2026-06-15: Documented single-report and accepted-cluster handling, including
  required `reportCount` semantics.
- 2026-06-16: Required offset-bearing timestamps, observation no later than
  acceptance, and HTTP(S) source URLs.
- 2026-06-17: Verified package builds/tests for ingest contracts and triage,
  `npm run data:validate`, and `npm run check`.

## Follow-ups and current boundaries

The [licensing plan](../active/data-licensing-attribution.md) retains the unresolved
inbound-terms/public-text decision; completed ingestion is not a reuse-rights
approval. The [direct-ingestion plan](../active/direct-main-ingestion.md) owns any
future workflow cutover. The original paired site work must be checked in its
own repository before asserting current runtime or deployment status.
