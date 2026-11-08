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

An agency declaration with no references from **any** declared route can carry
the `unreferenced` disposition. Its original identity, source-record digest and
review reason remain in the mapping, without an invented operator target.
Evaluation checks routes outside the pilot and routes without trips too; an
agency used by either cannot carry this disposition. Routes and stops cannot
use it. This accounts for unused publisher metadata without waiving unresolved
service evidence, and it still requires the draft's normal exact approval.

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

## Combined review on supported service dates

`createScheduledCombinedReview` composes the accepted holiday, platform-allocation,
distinct-platform-association, source-journey and explicit shared-service policies.
`verifyScheduledCombinedReview` reconstructs every saved claim from the original
verified context. The separate `gtfs-combined-schedule-review-draft` is a review
packet, not an assignment document or an approval accepted by release consumers.

The [applicability policy](gtfs-november-applicability-policy-2026-11-02.json)
binds the exact capture SHA-256, original table manifest, revision, timezone,
service-date basis and an explicit half-open range. It records the maintainer's
November assumption; neither retrieval month, source lineage nor release embargo
sets these bounds automatically. The physical-association policy must name the
same range. Journey and membership claims outside it are rejected.

All source tables, raw feed bounds, trips, literal labels and ordered/repeated
calls remain unchanged. Every effective date is partitioned into supported or
outside-applicability, with original and holiday-added/removed dates retained.
Outside dates are source diagnostics, not inactive dates or approved exclusions.
The original all-year diagnostics stay available alongside supported-date checks.

The composed review topology retains the accepted allocation additions and binds
the source-journey rules. Every dated service/code/path, operator, recursive stop
identity and unassociated complete platform group still passes its existing
checks. Associated A/C and B/D members remain distinct; C/D retain
`not_in_service` and false passenger access. A repeated station remains repeated.
Shared targets retain every dated service candidate, validate their identical
complete ordered segment, and pass platform checks for each member. One source
trip on one date is counted once regardless of its service memberships.

Shared memberships remain explicit claims using the existing exact-base contract.
Their `baseDraftSha256` binds the nested **source-journey grouped mapping**, before
membership application, not the combined wrapper. That source-journey component
remains the strict baseline. Claim structure, exact base identity and date coverage
are checked first; service/path and platform validity are then checked under the
composed association semantics. A shared journey can therefore retain both A/C
members without making restricted C boardable. Standalone mapping checks remain
strict, and a group with no usable member remains unresolved.
The combined digest additionally
binds all input policies, claims, composed topology, source evidence and full
source/effective/supported/outside population. Edited dates, access restrictions,
physical members or identities invalidate saved-review verification. No approval
is generated; mapping-review and generation eligibility stay false even when
all supported dates have proposals.

Service dates control overnight bounds: October 31 trips reaching November 1
remain outside this November cohort, and November 30 trips retain their December 1
tails. The latter supplies no December 1 service-date applicability. Early
November 1 serving still needs another applicable source or an explicit gap.
See [combined assignments and approval](gtfs-trip-assignment-validation.md#assignments-from-combined-mappings)
for the next stage. Artifact, import and serving support remain separate.

For capture-scoped review, set `captureServiceDate` to the receipt's retrieval
date in Singapore. The selected revision of every service in an assignment must
be active on both the capture date and the trip's service date. Trips using a
later revision remain explicit gaps. The policy's serving bounds, source
calendars and dated operational exceptions are evaluated separately.

### Reproduce the combined November review

Use Node 24 with `TZ=UTC` after `npm run build:fs`. Use the pinned original
receipt/ZIP and attribution from the
[allocation review](gtfs-source-platform-allocation-review.md#capture-comparison).
Run against canonical commit `1755d90c8f69d95a7a8ba2c5f20a47c60278ee2d` (merged #464):

```sh
node scripts/draft-gtfs-scoped-review.mjs \
  /tmp/gtfs-current-capture-20261105/schedule.zip \
  /tmp/gtfs-current-capture-20261105/capture.json \
  NSL,EWL,NEL,CCL,DTL,TEL,BPLRT,SKLRT,PGLRT \
  /tmp/new-combined-base \
  --canonical-commit 1755d90c8f69d95a7a8ba2c5f20a47c60278ee2d \
  --holiday-policy docs/gtfs-shared-holiday-policy-2026-11-02.json \
  --holiday-calendar SG-2026 \
  --platform-allocation-policy docs/gtfs-platform-allocation-policy-2026-11-02.json \
  --platform-association-policy docs/gtfs-nsl-platform-association-policy-2026-11-02.json \
  --source-journey-policy docs/gtfs-source-journey-policy-2026-11-02.json \
  --applicability-policy docs/gtfs-november-applicability-policy-2026-11-02.json
```

This first run retains 3,960 unresolved CCL pairs. Prepare explicit membership
claims for the already accepted branch/loop pairs from this base packet:

```js
import { readFile, writeFile } from 'node:fs/promises';
import { groupedScopedReviewDraftSha256 } from './packages/fs/dist/index.js';
const review = JSON.parse(await readFile('/tmp/new-combined-base/combined-review.json', 'utf8'));
const expected = new Set(['CCL_BRANCH_CW,CCL_LOOP_CW', 'CCL_BRANCH_CCW,CCL_LOOP_CCW']);
const claims = review.associationReview.patterns
  .filter(p => p.lineId === 'CCL')
  .flatMap(p => p.dateScopes.scopes.filter(s => s.candidates.length > 1).map(s => {
    if (!expected.has(s.candidates.map(c => c.id).sort().join(','))) {
      throw new Error('Unexpected CCL service tie');
    }
    return {
      providerPatternId: p.providerPatternId, serviceDates: s.serviceDates,
      target: { kind: 'sharedServiceRevisions', members: s.candidates },
      reason: 'Apply the accepted explicit branch/loop memberships to the complete shared source journey on supported November service dates.',
    };
  }));
if (claims.length !== 34) throw new Error('Unexpected CCL claim count');
await writeFile('/tmp/combined-memberships.json', JSON.stringify({
  schemaVersion: 1, documentKind: 'gtfs-shared-service-membership-claims',
  baseDraftSha256: groupedScopedReviewDraftSha256(review.sourceJourneyReview.mapping.mapping),
  claims,
}, null, 2) + '\n');
```

Execute the JavaScript from the repository root with `node --input-type=module`.
Repeat the command with a fresh output directory and
`--shared-service-memberships /tmp/combined-memberships.json`. Each explicit claim
is independently checked; the recipe does not create mapping approval. Output is
`combined-review.json`, `combined-evaluation.json` and `summary.json`. Replay uses
`--combined-review <review.json>` with the same policies and membership file.
Older mode-specific review/approval flags cannot mix with combined review.
Large generated packets and claims remain outside Git.

### Measured November result and remaining gates

With the pinned capture, committed canonical data at merged #464, the checked-in
policies and the 34 explicit CCL claims above:

| Population | Trip/date pairs |
| --- | ---: |
| Literal source calendars | 2,488,794 |
| Effective after holiday policy | 2,478,348 |
| Supported November service dates | 203,064 |
| Outside supported applicability, retained | 2,275,284 |
| Supported proposals | 203,064 |
| Supported unresolved or excluded | 0 |

There are no unresolved entity decisions. The standalone association baseline
has 4,060 unresolved supported pairs. Composition resolves its 30 unusual NSL
and 70 TEL pairs; explicit shared memberships resolve the remaining 3,960 CCL
pairs. Across all 392 patterns, 353 supported pattern reviews are identical to
the baseline. All previously passing targets, source identities, trip membership,
literal/effective dates and original all-year diagnostics are unchanged. All 17
unusual trips' original stop-time rows compare exactly with the ZIP. All 47
restricted platform association records retain false passenger access.

The combined wrapper digest is
`12ce071a566026da1bcc1369d160557f5dc4b44a201b6b34ffb086b4d473b7e9`;
the complete population digest is
`a0b5c914625b50e9f59fc2211928a5a5ada0b574cca0046c031f397c9e7fd3b8`.
These bind exact policy/claim text and canonical identity; regenerate after edits.
Local base, complete, replay and association-baseline packets are under
`/tmp/gtfs-combined-main-20261107-*`; the corrected complete/replay packets are
`/tmp/gtfs-combined-review-fix-20261107-*`, with explicit claims at
`/tmp/gtfs-combined-memberships-20261107.json`. All large outputs remain outside Git.

Validation: all 861 deterministic tests, package builds, lint, package boundaries
and documentation links pass under Node 24 with `TZ=UTC`. Five combined scenarios
cover repeated calls and restricted groups, explicit shared memberships, 25-hour
service-date boundaries and stale/unsupported edits. Saved-review replay reproduces
all three output files byte for byte. Six invalid CLI combinations fail before
source reads or output creation.

Readiness is **unapproved**, with mapping-review and generation eligibility false.

### November operating conditions

The pinned LTA capture was retrieved on 2 November 2026 at 20:00 UTC. Its
`calendar_dates.txt` has no exceptions. The raw ZIP and compact timetable agree
on all 5,910 trips for each of the four November Saturdays.

- **Deepavali Eve, 7 November.** [SMRT](https://www.smrt.com.sg/news-publications/newsroom/service-announcements/last-bus-train-timings-extension-for-deepavali-eve-2026/)
  announced extensions on NSL, EWL, CCL and TEL. [SBS Transit](https://sbstransit.com.sg/news/extension-of-operational-hours-for-train-and-selected-bus-services-on-eve-of-deepavali-5)
  announced extensions on NEL, DTL and both Sengkang and Punggol LRT. For
  example, the capture's last Bayshore departure to Woodlands North is `23:42`
  versus `24:12` in SMRT's notice. [SBS's poster](https://www.sbstransit.com.sg/Uploads/Posters%20-%20Extension%20of%20Operational%20Hours%20for%20Train%20and%20Selected%20Bus%20Services%20on%20Eve%20of%20Deepavali%20-%20Copy%201.pdf)
  gives `25:06` from Sengkang and `25:09` from Punggol versus `24:32:10` and
  `24:31:10` in the capture. The departures after midnight belong to the
  7 November service date.
- **Regular TEL Saturdays.** Foldaway uses the GTFS trips as supplied in this
  capture for the regular Saturday timetable. All 539 TEL trips on 14 and
  15 November have matching stop times and directions across the two days.
  First departures in GTFS are at least 20 minutes later than SMRT's Saturday
  times at each of the eight stations sampled, including
  [Woodlands North](https://connect-cdn.smrt.wwprojects.com/autoupdate/mrt-timing/woodlands%20north.html)
  and [Bayshore](https://connect-cdn.smrt.wwprojects.com/autoupdate/mrt-timing/bayshore.html).
  At [Marine Terrace](https://journey.smrt.com.sg/journey/station_info/marine-terrace/first-and-last-train/),
  GTFS gives `06:16` toward Woodlands North and `06:23` toward Bayshore on
  all four Saturdays. SMRT lists `05:56` and `06:03` for Saturdays and the
  GTFS times for Sundays and public holidays. The decision records Foldaway's
  source preference. Actual Saturday operations remain unverified.
- **BPLRT closures.** [LTA's dated notice](https://www.lta.gov.sg/content/ltagov/en/map/announcement.html/1000)
  closed BPLRT on 20 and 27 September. The raw capture still lists 394 trips on
  each date, outside the November window. [LTA's 3 November listing](https://www.lta.gov.sg/content/ltagov/en/map/announcement.html)
  shows no planned rail adjustments at that update. SMRT also explicitly
  excludes BPLRT and the Changi Airport service from the Deepavali Eve extension.

Full mapping coverage counts the trips supplied by LTA within the supported
dates. The Deepavali Eve extensions remain a separate coverage gap. The notices
provide last departures without a complete trip list. Release approval is a
separate decision.
