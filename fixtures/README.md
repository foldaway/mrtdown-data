Fixture data is generated on demand by `npm run fixtures:generate`.

The generated tree lives under `fixtures/generated/data` and is intentionally
not committed. It is modeled after the Hong Kong MTR so package and CLI tests do
not look like a subset of the canonical Singapore data.

Fixture issue dates are relative to the current Singapore date when generated,
which keeps the sample disruption and planned-work records recent while
preserving stable IDs for the duration of a test run. Tests that need exact IDs
or dates should read `fixtures/generated/meta.json`.

Hand-authored ingest payload examples live under `fixtures/ingest`. They are
not generated and should remain valid against `@mrtdown/ingest-contracts`.

Historical ingestion regression cases live under `fixtures/triage-regressions`.
They preserve normalized inputs and semantic expectations from real corrected,
rejected, and successful ingestion pull requests. List or filter them with
`npm run triage:regressions -- --list`; the command is read-only and does not
call a model. Add `--replay` and set `OPENAI_API_KEY` to run paid semantic
replay against the recorded base revision in a temporary data root.
