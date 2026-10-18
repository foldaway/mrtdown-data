# mrtdown-data

This repository maintains MRTDown's reviewed data for Singapore's rail
network: stations, services, station layouts, and records of disruptions,
maintenance, and infrastructure issues.
Use the tools here to inspect records, validate changes, process evidence, and
build data exports for applications. [mrtdown-site](https://github.com/foldaway/mrtdown-site)
imports the published exports and serves the runtime API.

## Get started

Use Node.js 24, as in CI, then install dependencies and validate the data:

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

The reviewed dataset lives in `data/`:

| Path | Contents |
| --- | --- |
| `station/` | Stations, including exits and optional platform information. |
| `line/`, `service/`, `operator/`, `town/`, `landmark/` | The rail network and nearby places. |
| `issue/YYYY/MM/<issue_id>/` | Issue metadata (`issue.json`), source evidence (`evidence.ndjson`), and append-only impact events (`impact.ndjson`). |
| `schematic-map/system/` | Map rules and design constraints; see the [map plan](docs/plans/active/schematic-system-map.md). |
| `rights/source-registry.json` | Source rights and attribution rules. |

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

For relevant changes, CI builds branch and pull request previews as temporary
artifacts. The [Pages deployment workflow](.github/workflows/pages-deploy.yml)
publishes from `main`, then asks `mrtdown-site` to import the new archive. See
the workflow for the required site URL and token secrets.

## Process evidence

The triage tools use AI models to turn source evidence into issue records. Set
`MESSAGE` to a JSON payload matching the
[shared webhook schemas](packages/ingest-contracts/README.md), then run:

```bash
npm run ingest:webhook
```

[The triage guide](packages/triage/README.md) covers crowd reports, targeted
repairs, and model setup. `fixtures/ingest/crowd-report.json` is a sample payload.

Inspect past ingestion outcomes without model calls or changes to `data/`:

```bash
npm run triage:regressions -- --list
```

Model evaluations (`npm run test:eval`) and regression `--replay` make paid API
calls and require `OPENAI_API_KEY`. Regression replay uses a temporary copy of
the recorded data revision. These checks are separate from deterministic tests.

## Inspect GTFS schedules

Local tools can verify captured GTFS files, inspect schedules and realtime
messages, export source timetables, and look up departures by provider trip or
stop. See [local GTFS inspection](docs/gtfs-local-inspection.md) for commands
and the [capture handoff](docs/gtfs-public-handoff.md) for acquiring inputs.

Inspection preserves provider IDs and leaves canonical data unchanged.
Generating and publishing scheduled arrival data still requires approved
mappings, verified source coverage, checks for changes between captures, and
licensing and publication review. Keep raw captures and generated reports
outside `data/` and Git pending that review.

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

MRTDown-authored data and export metadata use
[CC-BY-4.0](LICENSE-DATA.md). Code, scripts, tooling, and documentation use the
[MIT License](LICENSE-CODE.md).

Station exits contain LTA data under the Singapore Open Data Licence v1.0.
Observed platform facts and recorded inferences follow the
[station layout source policy](docs/plans/active/station-layout-data.md);
MRTDown's own curation and metadata use CC-BY-4.0. The
[data license](LICENSE-DATA.md) contains the attribution notices and scope.

Third-party evidence retains its upstream rights and terms. The
[source registry](data/rights/source-registry.json) records recurring source
classes and attribution requirements; MRTDown's license does not relicense
those materials.
