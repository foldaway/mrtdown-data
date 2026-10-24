# mrtdown-data

Station, service, and layout data for Singapore's rail network, plus records
of disruptions, maintenance, and infrastructure issues.

Use the tools here to inspect records, validate changes, process evidence, and
build data exports for applications.

## Get started

Use the Node.js version in [.nvmrc](.nvmrc), then install dependencies and
validate the data:

```bash
npm ci
npm run build:packages
npm run data:validate
```

The CLI can list records, show an individual record, or inspect an issue's state:

```bash
node packages/cli/dist/index.js --data-dir data list station
node packages/cli/dist/index.js --data-dir data show station <id>
node packages/cli/dist/index.js --data-dir data issue state <id>
```

See the [CLI command reference](packages/cli/src/usage.ts) for creation commands
and other tools.

## Explore the data

The dataset lives in `data/`. External GTFS files can be inspected locally.

| Data | Contents |
| --- | --- |
| `station/` | Stations, including exits and optional platform information. |
| `line/`, `service/`, `operator/`, `town/`, `landmark/` | The rail network and nearby places. |
| `issue/YYYY/MM/<issue_id>/` | Issue metadata (`issue.json`), source evidence (`evidence.ndjson`), and append-only impact events (`impact.ndjson`). |
| `schematic-map/system/` | Map rules and design constraints; see the [map plan](docs/plans/active/schematic-system-map.md). |
| `rights/source-registry.json` | Source rights and attribution rules. |
| External GTFS files | [Schedule, realtime, and departure inspection](docs/gtfs-local-inspection.md); arrival generation and publication require mapping and licensing review. |

Issue types are `disruption`, `maintenance`, and `infra`; ongoing issues use
open-ended periods.

Validate every data change with `npm run data:validate`. For station layout
updates, follow the [exit and platform source policy](docs/plans/active/station-layout-data.md).
These commands import LTA exits and report possible platform labels inferred
from reviewed observations:

```bash
npm run data:import:lta-station-exits -- /path/to/exits.geojson
npm run data:platforms:infer -- --write /tmp/platform-inference.json
```

## Build and publish exports

```bash
npm run pages:build
```

This writes `pages-dist/` with browsable JSON records, a manifest, and ZIP and
TAR archives. It validates the exported data and redacts source text and
rendered content when the source registry disallows public export. Generated
test data appears under `fixtures/` in the same bundle.

The build can also include a reviewed GTFS timetable with source attribution
and release checks. See [timetable Pages packaging](docs/gtfs-timetable-release.md#packaging-a-release-for-pages).
Default builds omit the timetable. Local consumers can query
[retained scheduled departures](docs/gtfs-retained-departures.md) across service
days, with source provenance and explicit missing coverage.

For relevant changes, CI builds branch and pull request previews as temporary
artifacts. The [Pages deployment workflow](.github/workflows/pages-deploy.yml)
publishes from `main`, then asks [mrtdown-site](https://github.com/foldaway/mrtdown-site)
to import the new archive. The site serves the runtime API. See the workflow
for the required site URL and token secrets.

## Process evidence

The triage tools use AI models to turn source evidence into issue records.
Webhook ingestion requires `OPENAI_API_KEY` and makes paid model calls. Set
`MESSAGE` to a JSON payload matching the
[shared webhook schemas](packages/ingest-contracts/README.md), then run:

```bash
npm run ingest:webhook
```

[The triage guide](packages/triage/README.md) covers crowd reports, targeted
repairs, and model setup. `fixtures/ingest/crowd-report.json` is a sample payload.

The [ingest workflow](.github/workflows/ingest.yml) processes one event at a
time and queues up to 100 pending runs. It rebases reused automated PR branches
onto current `main` before ingestion and protects pushes with explicit leases.
Existing PRs are validated even when ingestion adds no data. If main advances
before merge, it retries up to three times, rebasing and rerunning
[deterministic validation](scripts/validate-ingest.sh) without repeating paid
ingestion. Conflicts and concurrent PR edits stop the run for manual resolution.
The base check and GitHub merge are separate requests; strict up-to-date branch
protection or a merge queue is needed to enforce the base atomically on GitHub.

Inspect past ingestion outcomes without model calls or changes to `data/`:

```bash
npm run triage:regressions -- --list
```

Model evaluations (`npm run test:eval`) and regression `--replay` make paid API
calls and require `OPENAI_API_KEY`. Regression replay uses a temporary copy of
the recorded data revision. These checks are separate from deterministic tests.

## Work on the tools

The packages separate data definitions, file access, and evidence processing:

| Package | Purpose and dependencies |
| --- | --- |
| `core` | Schemas, time helpers, and state helpers; independent of the other packages. |
| `ingest-contracts` | Webhook payload schemas; independent of the other packages. |
| `fs` | Read, write, validate, and export files; depends on `core`. |
| `triage` | Process evidence and replay outcomes; depends on `core`, `fs`, and `ingest-contracts`. |
| `cli` | Provide command-line access to the tools; depends on `core`, `fs`, and `triage`. |

Run the repository checks and deterministic tests before committing:

```bash
npm run check  # Lint, package boundaries, and documentation links
npm test       # Deterministic tests; generates fixtures first
```

`npm run lint` runs lint checks alone. Package-specific build and test commands
are listed in [package.json](package.json). Tests and examples use generated
data in `fixtures/generated/data`; recorded ingestion cases live in
`fixtures/triage-regressions`.

Keep generated output out of commits and separate bulk data changes from code
changes where practical. See [AGENTS.md](AGENTS.md) for contribution rules and
[the plans index](docs/plans/README.md) for active work and migration history.

## Licenses and sources

| Material | License or terms |
| --- | --- |
| MRTDown-authored data, curation, and export metadata | [CC-BY-4.0](LICENSE-DATA.md). |
| Code, scripts, tooling, and documentation | [MIT License](LICENSE-CODE.md). |
| LTA data in station exits | [Singapore Open Data Licence v1.0](LICENSE-DATA.md#singapore-open-data). |
| Third-party evidence | Upstream rights and terms apply; MRTDown does not relicense these materials. |

Observed platform facts and recorded inferences follow the
[station layout source policy](docs/plans/active/station-layout-data.md).
The [source registry](data/rights/source-registry.json) records recurring source
classes and attribution requirements.
