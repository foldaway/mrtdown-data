# Holiday-aware mapping review

The holiday mapping gate evaluates one explicitly configured policy across
compatible line families. The [shared family review](gtfs-shared-holiday-family-review.md)
records the fresh nine-family capture results and the
[policy](gtfs-shared-holiday-policy-2026.json) lists every bound active route.
The ordinary Sunday-on-public-holidays substitution remains a Foldaway
assumption transferred in the [cross-line review](gtfs-cross-line-mapping-review-2026-10-28.md).
No operator confirmation of identical full-day departures is implied.

## Contract and identity

`@mrtdown/fs` exports `createScheduledHolidayMappingDraft`,
`evaluateScheduledHolidayMapping`, `scheduledHolidayMappingDraftSha256`,
`ScheduledHolidayMappingDraftSchema` and `ScheduledHolidayMappingApprovalSchema`,
plus their inferred draft and approval types.

Both creation and evaluation require the original verified context, explicit
policy, canonical holiday calendar and a
[verified holiday-date review draft](gtfs-nel-holiday-date-review.md).
They regenerate that date review against the inputs before using its population.
The strict `gtfs-holiday-mapping-draft` wrapper contains the existing version-3
grouped mapping structure, plus an identity binding:

- Original table manifest, canonical commit and topology projection digest.
- Policy digest, including its revision and authoritative holiday calendar digest.
- Resulting date-population digest, including original/effective/added/removed
  dates, source trip IDs and explicit family bindings.
- Exact verified holiday-date review draft digest and its candidate evidence.

The distinct `gtfs-holiday-mapping-approval` records that same identity, the
normalized mapping draft digest, reviewer and reason. The mapping digest binds
all decisions, targets, exact date sets, reasons and preparer text. Approval is
repository-review metadata, not authentication. The tooling emits no approval
record; a reviewer must supply an actual reviewed record.
Literal-source approvals cannot satisfy this contract. The existing literal
mapping and assignment entry points reject the holiday wrapper.

## Shared validation and eligibility

The nested mapping is editable through the existing grouped decision fields.
Evaluation reuses the strict grouped review implementation with the verified
effective dates and freshly generated evidence. It checks source hashes, exact
date sets, unique temporal targets, station-code and revision periods, route
agency/operator periods, stop parents, every member of complete literal platform
groups, service restrictions and boarding rules. Proposed cells remain subject
to every check after edits; approval cannot bypass a failed check.

The complete source inventory remains present. Bound families use derived dates;
unbound families retain their literal dates and unresolved proposals. Missing
entries or dates leave coverage incomplete. Overlapping decisions, dates outside
the effective population, stale identities and invalid targets make evaluation
invalid. A matched digest alone cannot clear unresolved decisions or incomplete
coverage. Holiday evaluation rejects `ignored` entities and `excluded` pattern
cells; these cannot turn unresolved source evidence into approved coverage.
The mapping pilot must equal the explicit policy line families.

Without approval, a valid complete population remains `unapproved` or
`unresolved`. Only valid, complete, fully resolved mapping with a matching approval
and at least one matched date becomes `reviewed-mapping-only`, with
`mappingReviewEligible: true`. `generationEligible` is always false.

All dates are original service dates. A Saturday departure at `25:00` remains
Saturday's trip even if the next wall-clock day is a holiday. Sunday dates occur
once. Source IDs, tables, ZIP bytes and manifests stay unchanged.

## Generate and inspect

Run under Node 24 with `TZ=UTC`, after `npm run build:fs`:

```sh
node scripts/draft-gtfs-scoped-review.mjs \
  /tmp/amk-correction-input-20261029/schedule.zip \
  /tmp/amk-correction-input-20261029/capture.json \
  NSL,EWL,NEL,CCL,DTL,TEL,BPLRT,SKLRT,PGLRT \
  /tmp/new-holiday-mapping-review \
  --canonical-commit 1a6859aa67a9ad9d03663ceff4091ccf980b2b30 \
  --holiday-policy docs/gtfs-shared-holiday-policy-2026.json \
  --holiday-calendar SG-2026
```

The runner verifies the receipt hash/size and committed canonical data, then
writes `holiday-date-review.json`, `holiday-mapping-draft.json`,
`holiday-mapping-evaluation.json` and `summary.json` to a new directory.
Large generated packets stay outside Git. No human approval is generated.

To evaluate reviewed edits or supplied approval metadata, use another new output
directory and add the relevant paths to the same command:

```sh
  --holiday-date-review /tmp/review/holiday-date-review.json \
  --holiday-mapping /tmp/review/holiday-mapping-draft.json \
  --holiday-approval /tmp/review/actual-reviewer-approval.json
```

Each inspection still regenerates policy/date/canonical evidence. Omit
`--holiday-approval` to inspect edits without approval. Malformed or stale date
reviews fail immediately; a structurally valid but invalid mapping writes its
evaluation and exits unsuccessfully. Holiday mode cannot combine with literal
`--platform-groups`, `--blockers` or `--assignments` options. Ordinary invocations
retain literal-source behavior.

## Subsequent work

Exact-date assignment documents, assigned timetable bundles, departure consumers,
site holiday adoption and publication wiring are separate consumers of this gate.
Source admission, source-condition review, whole-feed coverage and exact-manifest
release approval remain required by the
[publication contract](gtfs-schedule-publication.md). No assignment, approval,
release, deployment or public timetable is produced here.

Platform conflicts at Expo and Sengkang East, AMK C/D restrictions, Marina South
Pier terminal semantics, CCL dated revision/code ambiguity and supplied no-path
trips remain evidence work. BPLRT closures, holiday-eve extras and TEL's Marine
Terrace Saturday discrepancy require separate source-condition review. Sunday
substitution supplies none of those missing facts.
