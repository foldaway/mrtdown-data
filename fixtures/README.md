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
