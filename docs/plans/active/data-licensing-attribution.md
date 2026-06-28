# Data Licensing And Attribution Plan

## Context

`mrtdown-data` publishes reviewed Singapore rail data, issue records, evidence,
impact events, schemas, and static Pages/archive artifacts. The repository owns
the canonical data model, validation rules, curated issue history, normalized
facts, generated fixture data, and export tooling.

Not every value in the repository has the same rights position. Static rail
entities and MRTDown-authored issue metadata can be licensed by this project.
Evidence rows may also contain third-party source text, platform content,
government open data, news metadata, or user-submitted reports. Those upstream
rights should not be flattened into a single repository license.

This plan defines a rights model that keeps canonical data maintainable without
adding repetitive license metadata to every `evidence.ndjson` line.

Related references:

- `README.md`
- `data/issue/YYYY/MM/<issue_id>/evidence.ndjson`
- `packages/core/src/schema/Issue.ts`
- `packages/fs/src/manifest.ts`
- `scripts/build-pages-artifact.mjs`
- `docs/plans/completed/crowdsourced-reports.md`

## Goals

- Publish a clear top-level license for MRTDown-authored data.
- Keep code licensing separate from data licensing.
- Preserve upstream attribution and rights for third-party evidence sources.
- Avoid touching every historical evidence row when rights can be inferred from
  `sourceUrl` or source class.
- Add validation that every evidence row resolves to exactly one rights rule.
- Generate attribution notices for the Pages/archive artifact.
- Make source-specific rights explicit for LTA/DataMall, X/Twitter, Reddit,
  CNA/Mediacorp, Straits Times/SPH, direct crowd reports, and other recurring
  evidence sources.
- Keep deterministic tests separate from any live network or platform checks.

## Non-Goals

- This plan does not provide legal advice or decide final counsel-approved
  wording.
- This plan does not relicense third-party text, posts, article bodies,
  screenshots, trademarks, or upstream datasets that MRTDown does not own.
- This plan does not require per-row rights metadata for rows that can be
  resolved through a source registry.
- This plan does not fetch live platform terms during validation.
- This plan does not remove evidence text from historical records unless a
  later legal review requires it.

## Licensing Policy

Use separate licensing layers:

- MRTDown-authored data: Creative Commons Attribution 4.0 International
  (`CC-BY-4.0`).
- Package source code: keep separate from data licensing, either unlicensed or
  under a software license chosen by the project.
- Third-party source text and linked material: not licensed by MRTDown.
- Government open data mirrored or derived from Singapore open data sources:
  preserve the upstream Singapore Open Data Licence notice while licensing only
  MRTDown-authored curation, normalization, and derived metadata under
  `CC-BY-4.0`.
- Direct crowd reports: require inbound submitter terms before treating report
  text as MRTDown-licensable public content.

The top-level repository license should state that `CC-BY-4.0` applies to
MRTDown-authored canonical data and generated data exports, except where a file
or generated notice identifies third-party material or upstream terms.

## Source Registry

Add a canonical registry for source classes:

```text
data/rights/source-registry.json
```

The registry should map URL/source patterns to rights and attribution rules.
Evidence rows keep ordinary provenance fields such as `sourceUrl`, `ts`, and
`type`; the registry supplies the rights classification.

Example shape:

```json
{
  "schemaVersion": 1,
  "rules": [
    {
      "id": "x-post",
      "match": {
        "sourceUrlHost": ["x.com", "twitter.com"]
      },
      "contentRights": "LicenseRef-X-Content",
      "mrtdownRights": "CC-BY-4.0",
      "policy": "third-party-content-not-licensed-by-mrtdown",
      "attributionTemplate": "{sourceUrl}"
    },
    {
      "id": "lta-datamall",
      "match": {
        "sourceUrlHost": ["datamall.lta.gov.sg"]
      },
      "contentRights": "Singapore-Open-Data-Licence-1.0",
      "mrtdownRights": "CC-BY-4.0",
      "policy": "preserve-upstream-open-data-notice",
      "attributionTemplate": "Contains information from LTA DataMall accessed via {sourceUrl}, made available under the Singapore Open Data Licence version 1.0."
    }
  ]
}
```

Rules should support at least:

- URL host matching;
- optional path prefix matching;
- optional evidence type matching;
- a stable rule id;
- upstream content rights id;
- MRTDown rights id;
- attribution template;
- publication policy.

Avoid per-row overrides at first. Add overrides only for ambiguous archive URLs,
missing `sourceUrl`, direct crowd reports, or mixed-source records that cannot
be resolved from the normal rule set.

`packages/core` should own and export the Zod schemas and inferred TypeScript
types for the source registry, rights ids, resolved attribution entries, and
generated attribution index. These shapes are shared contracts: `packages/fs`
needs them for validation and artifact writing, `packages/cli` needs them for
inspection or generation commands, and downstream consumers may eventually use
them to validate the published machine-readable attribution file. Keep matching
and filesystem behavior outside `core`; `core` should define the data contract,
not repository I/O.

## Rights Categories

Start with these recurring categories:

- `mrtdown-authored`: static entities, issue metadata, normalized claims,
  impact events, generated fixture records, and generated export metadata owned
  by MRTDown.
- `sg-open-data`: Singapore government or agency open data, including
  LTA/DataMall-derived data where applicable.
- `platform-post`: X/Twitter, Reddit, or similar third-party platform content.
- `news-publication`: CNA/Mediacorp, Straits Times/SPH, and other publisher
  articles.
- `crowd-report`: reports submitted directly to MRTDown under explicit inbound
  terms.
- `generic-web`: linked web pages and archived snapshots that are not covered
  by a more specific open-data, platform, publisher, or crowd-report rule.
- `unknown-third-party`: temporary classification that should fail publication
  until resolved or explicitly suppressed from public export.

The registry should prefer conservative classifications. For example, a CNA
article URL should classify the article text as third-party publisher content,
while allowing MRTDown-authored factual summaries or normalized claims to be
licensed separately.

## Evidence Row Boundary

Do not make `evidence.ndjson` one licensed blob. Treat each line as an evidence
record whose rights are resolved at validation/export time.

The canonical evidence row should continue to carry stable provenance:

```json
{
  "id": "ev_...",
  "ts": "2026-05-24T12:00:00+08:00",
  "type": "statement.official",
  "text": "...",
  "sourceUrl": "https://example.com/source"
}
```

The resolved publication metadata can be generated:

```json
{
  "evidenceId": "ev_...",
  "issueId": "2026-05-24-example",
  "sourceUrl": "https://example.com/source",
  "sourceRuleId": "news-publication",
  "contentRights": "LicenseRef-Publisher-All-Rights-Reserved",
  "mrtdownRights": "CC-BY-4.0",
  "policy": "third-party-content-not-licensed-by-mrtdown",
  "attribution": "..."
}
```

If a future schema separates quoted source text from MRTDown-authored claims,
license claims under MRTDown's data license and mark quoted source text under
the upstream source rule.

## Generated Attribution

Add generated attribution artifacts to the Pages/archive build:

```text
attribution.json
ATTRIBUTION.md
licenses/
  CC-BY-4.0.txt
  Singapore-Open-Data-Licence-1.0.txt
  THIRD-PARTY-NOTICES.md
```

Use JSON instead of NDJSON for the public attribution index. The attribution
payload is metadata that consumers are likely to inspect as one document, and
grouping by source rule or source URL is easier to represent as structured
JSON. NDJSON is only worth revisiting if the attribution output becomes large
enough that streaming reads matter.

The generated artifacts should include:

- repository-level MRTDown data license notice;
- source-rule summaries;
- one resolved attribution row per evidence row or per distinct source URL;
- upstream open-data notices where required;
- a clear statement that third-party source text is not licensed by MRTDown.

The generated artifacts should be deterministic so CI can snapshot or validate
them without network access.

The generated Pages HTML should expose these artifacts visibly instead of only
placing files in the archive. The root `index.html` should link to
`ATTRIBUTION.md`, `attribution.json`, and the license/third-party notice files
near the existing manifest/archive links. If the generated HTML later grows
source summaries, keep it concise: show the data license, a third-party material
notice, and links to the machine-readable and human-readable attribution
artifacts. Do not duplicate the full attribution index in HTML.

## Validation

Validation should fail when:

- an evidence row has no `sourceUrl` and no allowed source override;
- an evidence row matches no source registry rule;
- an evidence row matches multiple source registry rules without a priority or
  explicit disambiguation;
- a source registry rule references an unknown rights id;
- a rule with an open-data rights id lacks an attribution template;
- a public export would include `unknown-third-party` content.

Validation should warn, not fail, when:

- a source URL host is known but the path pattern is more general than ideal;
- attribution templates cannot fill optional values such as author or publisher;
- historical rows use legacy hosts that resolve to the same source class.

## Phases

### Phase 1: Policy And Registry

- Add top-level data licensing text and third-party carve-outs.
- Decide whether package source code remains `UNLICENSED` or receives a
  separate software license.
- Add durable definitions for MRTDown-authored data, third-party source text,
  upstream open data, and generated artifacts.
- Document the preferred attribution format for downstream consumers.
- Add and export Zod schemas and inferred TypeScript types for
  `source-registry.json`, rights ids, resolved attribution entries, and the
  generated attribution index in `packages/core`.
- Add initial rights ids and source rules for X/Twitter, Reddit, LTA/DataMall,
  CNA/Mediacorp, Straits Times/SPH, direct crowd reports, and generic web
  sources.
- Add deterministic tests for rule matching and ambiguous matches.
- Keep the initial registry hand-authored and small enough to review.

Exit criteria:

- Repository license wording clearly separates MRTDown-authored data from
  third-party material.
- Downstream consumers can understand what they may reuse under `CC-BY-4.0`.
- Every known recurring source class has a registry rule.
- Rule matching is deterministic and covered by tests.

### Phase 2: Validation And Attribution

- Teach file-backed validation to load the source registry.
- Resolve each evidence row's `sourceUrl` to exactly one rule.
- Add fixture coverage for matched, unmatched, ambiguous, and override cases.
- Decide how to handle historical rows that lack source URLs.
- Add a deterministic attribution generator in the package or CLI layer.
- Generate `attribution.json` and human-readable `ATTRIBUTION.md`.
- Include source-rule summaries and per-source or per-evidence attribution.
- Add tests that normalize generated output for snapshot comparison.

Exit criteria:

- `npm run data:validate` catches unresolved evidence rights.
- No historical data row needs repetitive rights metadata just to pass.
- Attribution artifacts can be generated without network access.
- Generated output is stable across repeated runs.

### Phase 3: Publication And Ingest Guardrails

- Include license and attribution artifacts in `npm run pages:build`.
- Link the generated Pages HTML to `ATTRIBUTION.md`, `attribution.json`, and
  license/third-party notice files.
- Add manifest metadata that advertises license, attribution, and third-party
  notice paths.
- Document the public artifact licensing boundary in `README.md`.
- Update ingest contracts or triage code so new evidence keeps enough
  provenance to resolve rights automatically.
- For direct crowd reports, require inbound terms before public text is treated
  as MRTDown-licensable content.
- For new source classes, require adding a registry rule before evidence can be
  published.

Exit criteria:

- The Pages/archive artifact contains enough attribution context for
  downstream reuse.
- The generated `index.html` makes attribution and licensing discoverable
  without requiring users to inspect the archive manually.
- The manifest exposes machine-readable license and attribution pointers.
- New evidence cannot silently enter the canonical archive without a rights
  classification.
- Direct user submissions have an explicit rights path.

## Open Questions

- Should the repository license use a single `LICENSE` file with carve-outs, or
  a `LICENSE-DATA.md` plus separate package code license?
- Should `evidence.ndjson` continue storing third-party source text verbatim in
  public archives, or should public exports eventually publish only normalized
  claims plus source links for some source classes?
- Should generated attribution be one row per evidence record or one row per
  distinct source URL with back-references to evidence ids?
- What inbound terms should apply to direct crowd reports before report text is
  made public?
- Should counsel review happen before Phase 1 lands or before Pages
  publication changes?

## Review Notes

- Keep legal wording changes separate from mechanical source-registry and
  generator implementation when practical.
- Do not bulk-edit historical evidence rows unless validation proves specific
  rows lack resolvable provenance.
- Prefer conservative third-party classifications over broad reuse claims.
- Keep generated attribution and hand-authored registry changes in separate
  commits or PRs when review volume becomes large.
