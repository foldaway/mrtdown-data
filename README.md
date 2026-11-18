# mrtdown-data

Station, service, and layout data for Singapore's rail network, plus records
of disruptions, maintenance, and infrastructure issues.

The repository owns canonical data, shared packages, evidence ingestion, and
static exports. [mrtdown-site](https://github.com/foldaway/mrtdown-site) imports
the exports and serves the runtime API.

## Data layout

Canonical records live in [`data/`](data/):

| Path | Contents |
| --- | --- |
| `station/` | Stations, exits, and platform information. |
| `line/`, `service/`, `operator/` | Rail lines, service patterns, and operators. |
| `town/`, `landmark/` | Nearby places. |
| `public-holiday/` | Singapore holiday calendars by year. |
| `issue/YYYY/MM/<issue_id>/` | Issue metadata, source evidence, and impact events. |
| `schematic-map/system/` | Schematic map rules and constraints. |
| `rights/source-registry.json` | Source rights and attribution rules. |

See the [data guide](docs/data/overview.md) for record conventions and source
policies. External GTFS captures use a separate [inspection and review workflow](docs/gtfs/README.md).

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

See the [CLI command reference](packages/cli/src/usage.ts) for other commands.

## Local workflows

- Run `npm run check` and `npm test` before handing off changes. The
  [packages and checks guide](docs/development/packages.md) covers package
  boundaries and scoped commands.
- Validate canonical data changes with `npm run data:validate`. See the
  [data guide](docs/data/overview.md) for record layout and source policies.
- Build static exports with `npm run pages:build`. See the
  [Pages export guide](docs/operations/pages-exports.md) for publication and
  optional reviewed timetables.
- Use the [triage guide](packages/triage/README.md) for evidence ingestion,
  repairs, and regression replay. Model-dependent commands require
  `OPENAI_API_KEY` and make paid calls.

## Documentation

Use the [documentation index](docs/README.md) to find subject guides and the
[execution plan index](docs/plans/README.md) to find current work.

See [AGENTS.md](AGENTS.md) for repository working rules.

## Licenses and sources

MRTDown-authored data is [CC-BY-4.0](LICENSE-DATA.md); code and documentation
are [MIT](LICENSE-CODE.md). Third-party material retains its upstream terms.
See [licenses and sources](docs/data/overview.md#licenses-and-sources) for
attribution and source policies.
