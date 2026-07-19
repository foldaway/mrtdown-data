# mrtdown-data

Canonical MRTDown data for Singapore rail entities, issue records, and the
package tooling that validates and publishes them.

This repository is the source of truth for reviewed data. It does not serve the
runtime API; downstream apps consume the generated static GitHub Pages artifact.

## Quick Start

```bash
npm ci
npm run build:packages
npm run data:validate
npm test
```

For linting and formatting checks:

```bash
npm run lint
```

## Repository Layout

- `data/station`, `data/line`, `data/service`, `data/operator`, `data/town`,
  and `data/landmark`: canonical static entities.
- the `layout` property in `data/station/*.json`: station exits imported
  exclusively from LTA's MRT Station Exit GeoJSON dataset.
- `data/issue/YYYY/MM/<issue_id>/`: canonical issue bundles.
- `data/rights/source-registry.json`: source rights and attribution rules used
  for evidence classification.
- `fixtures/generated/data`: on-demand generated fixture data for tests and
  examples.
- `fixtures/triage-regressions`: checked-in historical ingestion cases and
  semantic expectations.
- `packages/core`: shared schemas, period helpers, and state helpers.
- `packages/ingest-contracts`: webhook payload schemas shared with external
  evidence producers.
- `packages/fs`: file-backed repositories, validation, manifest, and Pages
  export helpers.
- `packages/triage`: LLM-assisted evidence triage and replay utilities.
- `packages/cli`: command-line entry point for validating, inspecting, and
  creating target-layout data.
- `docs/plans`: active plans, completed migration reports, and durable tech
  debt.

## Common Commands

```bash
npm run build:packages     # Build all workspace packages
npm run typecheck          # Compile-check workspace packages
npm test                   # Run deterministic Vitest tests
npm run lint               # Run Biome checks
npm run check              # Run lint, boundary checks, and docs link checks
npm run data:validate      # Validate canonical data
npm run data:import:lta-station-exits -- /path/to/exits.geojson
npm run fixtures:validate  # Generate and validate fixture data
npm run triage:regressions -- --list  # List historical ingestion cases
npm run pages:build        # Build the GitHub Pages static data artifact
```

Package-specific build and test commands are available in `package.json` when a
change only touches one package.

## Static Pages Export

`npm run pages:build` writes the static artifact to `pages-dist/`.

The artifact publishes the canonical export at the root:

- `index.html`
- `manifest.json`
- `archive.tar.gz`
- `archive.zip`
- `station/`, `line/`, `service/`, `operator/`, `town/`, `landmark/`, and
  `issue/`

It also includes the deterministic fixture export under `fixtures/`:

- `fixtures/index.html`
- `fixtures/manifest.json`
- `fixtures/archive.tar.gz`
- `fixtures/archive.zip`
- the fixture data files used to build the fixture manifest

Preview branches and pull requests build the same bundle in CI and upload it as
a short-lived artifact. Only `main` deploys the bundle to GitHub Pages.

After a successful `main` Pages deployment, CI triggers the `mrtdown-site`
internal pull endpoint so the site can import the newly published archive. The
deploy workflow expects these repository secrets:

- `MRTDOWN_SITE_PULL_URL`: the full `mrtdown-site`
  `/internal/api/tasks/pull` URL.
- `MRTDOWN_SITE_INTERNAL_API_TOKEN`: a bearer token present in the site's
  `INTERNAL_API_TOKENS`.

## Data Model

### Static Entities

Static data records describe rail lines, services, stations, operators, towns,
and landmarks. Records are JSON files validated by the schemas in
`@mrtdown/core`.

### Issues

Issue records live in date-partitioned bundles:

```text
data/issue/YYYY/MM/<issue_id>/
  issue.json
  evidence.ndjson
  impact.ndjson
```

- `issue.json` stores the issue identity, type, and translated title.
- `evidence.ndjson` stores source evidence used to understand the issue.
- `impact.ndjson` stores append-only impact events derived from evidence.

Supported issue types are `disruption`, `maintenance`, and `infra`.

Use open-ended periods for ongoing issues. CLI validation is required whenever
canonical data changes.

## Data Licensing

MRTDown-authored canonical data and generated data exports are covered by
`CC-BY-4.0` as described in `LICENSE-DATA.md`. Package source code, scripts,
tooling, and associated documentation are licensed under the MIT License as
described in `LICENSE-CODE.md`.

Station layout records contain LTA station-exit data under the Singapore Open
Data Licence v1.0. The dataset-specific source and attribution notice is in
`LICENSE-DATA.md`.

Evidence may contain or link to third-party posts, articles, source text,
government source material, or direct report text. Those upstream materials are
not licensed by MRTDown. Recurring evidence source classes are recorded in
`data/rights/source-registry.json` so generated attribution artifacts can
preserve source-specific notices.

## Evidence Ingest

Webhook evidence payloads use the shared schemas in `@mrtdown/ingest-contracts`
and can be processed through `@mrtdown/triage`:

```bash
npm run ingest:webhook
```

Set `MESSAGE` to an `IngestPayload` JSON string before running the command.
`fixtures/ingest/crowd-report.json` is a valid crowd-report sample for manual
workflow dispatch testing.

Model-dependent triage evals are intentionally separate from the deterministic
test suite:

```bash
npm run test:eval
```

Run evals only when the package's documented environment variables are set and
the paid model calls are intentional.

Historical corrected, rejected, and successful ingestion outcomes are captured
as a deterministic regression corpus:

```bash
npm run triage:regressions -- --list
npm run triage:regressions -- --case pr-346-sklrt-reingest-effect
```

The corpus command validates and inspects cases without calling a model or
writing canonical data. Adding `--replay` makes explicit paid model calls and
runs semantic replay against a temporary copy of the recorded base revision;
canonical `data/` remains untouched.

## Contributing Notes

- Keep generated `pages-dist/`, package `dist/`, and local migration scratch
  files out of commits unless a change explicitly updates artifact policy.
- Keep generated data and hand-authored code in separate pull requests whenever
  practical.
- If documentation and code disagree, update the documentation in the same
  change.

Agent-specific repository guidance lives in `AGENTS.md`.
