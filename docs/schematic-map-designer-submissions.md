# Schematic Map Designer Submissions

Trusted visual authoring clients, such as a protected `mrtdown-site` map
designer, should submit schematic map edits as normal reviewable branches in
this repository. The designer is a helper for authoring constraints and review
artifacts; the canonical source remains `mrtdown-data`.

## Branch Contents

A designer-originated branch should contain:

- updated generator constraints under
  `data/schematic-map/system/generator/constraint/<YYYY-MM>.json`;
- a submission metadata file, usually `artifacts/schematic-map/submission.json`;
- generated review artifacts, such as semantic diff JSON, generator diff JSON,
  and a preview SVG, under an ignored `artifacts/` directory;
- no committed generated version snapshot unless a reviewer explicitly asks for
  a fixture.

The committed constraint set must pass the same validation as hand-authored
changes. Generated snapshots stay publication artifacts produced by the
deterministic generator.

## Submission Metadata

The submission metadata file is JSON:

```json
{
  "schemaVersion": 1,
  "type": "schematic-map-designer-submission",
  "mapId": "system",
  "sourceEffectiveDate": "2025-04",
  "targetEffectiveDate": "2025-06",
  "layoutEngineId": "lta-system-map-2011",
  "source": {
    "tool": "mrtdown-site-map-designer",
    "url": "https://example.invalid/designer-session"
  },
  "summary": "Move selected labels and route hints for the target version.",
  "files": {
    "constraint": "schematic-map/system/generator/constraint/2025-06.json",
    "semanticDiff": "artifacts/schematic-map/2025-04..2025-06.json",
    "generatorDiff": "artifacts/schematic-map/2025-04..2025-06.generator.json",
    "preview": "artifacts/schematic-map/2025-06.svg"
  },
  "notes": ["Optional reviewer notes."]
}
```

Required fields are `schemaVersion`, `type`, `mapId`, `sourceEffectiveDate`,
`targetEffectiveDate`, `layoutEngineId`, `source.tool`, `summary`, and
`files.constraint`.

`files.constraint` must point to the canonical target constraint path for
`targetEffectiveDate`. Optional diff and preview paths are review aids; they do
not replace canonical validation.

## Validation

Run:

```sh
npm run build:cli
node packages/cli/dist/index.js --data-dir data schematic-map validate-submission --file artifacts/schematic-map/submission.json
```

The command validates the metadata shape, confirms the target constraint set is
written at the expected canonical path, regenerates source and target snapshots,
and prints reviewer-facing constraint counts, coordinate counts, generator diff,
and semantic diff.

Before opening a PR, also run:

```sh
npm run data:validate
```

Reviewers should reject submissions that add unnecessary fixed coordinates or
exceptions when reusable rules or narrower constraints would explain the layout
change better.
