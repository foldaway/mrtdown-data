# Review GTFS platform allocations

GTFS names the platform for a scheduled trip. Canonical platform/service bindings
provide Foldaway's usual direction defaults. For the reviewed Expo, Sengkang East
and Paya Lebar stops, an explicit capture-specific policy lets the GTFS allocation take
precedence over that default. Source labels and canonical records stay intact.
The comparisons below distinguish the original Expo/Sengkang-only revision
from the Paya Lebar extension.

## Maintainer decision — 5 November 2026

The maintainer chose to assume LTA's GTFS is correct for now: canonical platform
references are logical defaults, while GTFS may reflect temporary re-routing.
This is an accepted **Foldaway assumption**, not evidence that temporary routing
actually occurred or operator confirmation of an allocation on every date.

The [platform evidence review](gtfs-platform-allocation-review-2026-10-31.md)
remains useful evidence of the defaults: Expo A toward Changi Airport and B toward
Tanah Merah, and Sengkang East 1 clockwise and 2 counterclockwise. The maintainer
subsequently checked and tentatively supported Expo A toward Changi Airport.
The supplied Bakau/Rumbia boards support the maintained directions there; eight
Sengkang bindings retain their same-line inference. None of this requires a
captured timetable to follow those defaults exclusively.

This decision replaces #458's earlier proposal to swap source labels. The
[allocation policy](gtfs-platform-allocation-policy-2026-11-02.json) instead
accepts these additional service allocations on the **literal source platform**:

| Source stop | Source platform retained | Additional service accepted for this capture |
| --- | --- | --- |
| `CG1_A` | Expo B | Toward Changi Airport |
| `CG1_B` | Expo A | Toward Tanah Merah |
| `SE1_A` … `SE5_A` | Platform 1 at Compassvale, Rumbia, Bakau, Kangkar and Ranggung | Counterclockwise |
| `SE1_B` … `SE5_B` | Platform 2 at the same five stations | Clockwise |
| `CC9_A` | Paya Lebar A | Anticlockwise branch and loop |
| `CC9_B` | Paya Lebar B | Clockwise branch and loop |

The normal canonical directions also remain valid in the review. Expo's first
morning Tanah Merah-bound train uses `CG1_A`, labelled B, so it continues to pass.
The weekday/Saturday variant departs Expo at 05:36:59; the Sunday/public-holiday
variant at 06:04:58. Each runs the full Changi Airport → Expo → Tanah Merah route.
All ordinary airport-bound trips use that same Expo stop, and later westbound
trips use `CG1_B`. A blanket label swap had made these first trains conflict;
source precedence preserves both timetable variants.

## Capture comparison

This historical comparison uses the original Expo/Sengkang-only policy v1.
Both runs use canonical commit `987147261a35eb771bcae223f50cdbf6174a1899`
after [PR #457](https://github.com/foldaway/mrtdown-data/pull/457), canonical
[SG-2026](../data/public-holiday/SG-2026.json), and the
[capture-specific holiday policy](gtfs-shared-holiday-policy-2026-11-02.json).
The verified [receipt](https://sources.mrtdown.org/captures/schedule/ceb07f9c91de86559212eb48c1feac6455452900fad49cf009414a66c2f17efe.json)
records retrieval at `2026-11-02T20:00:07.575Z`; its
[original ZIP](https://sources.mrtdown.org/blobs/schedule/ceb07f9c91de86559212eb48c1feac6455452900fad49cf009414a66c2f17efe.zip)
is 2,996,770 bytes, SHA-256
`ceb07f9c91de86559212eb48c1feac6455452900fad49cf009414a66c2f17efe`.
LTA attribution and licence are in the [public handoff](gtfs-public-handoff.md).
The receipt has no provider timestamp; discovery does not establish source-order
admission or approval.

This capture has 103 active routes, 19,140 recurring trips and 392 patterns.
Compared with the October packet, stops and calendars are identical; routes,
trips and stop times changed. The new holiday policy explicitly lists the active
routes. The older policy and reports remain historical; approvals do not transfer.

The effective population is **2,478,348 trip/date pairs** in both runs. Each
pair is one recurring source trip on one effective service date. Passing checks
produces mapping proposals, not published departures.

| Unresolved trip/date pairs | Canonical defaults enforced | Source allocation policy |
| --- | ---: | ---: |
| Expo airport branch | 80,549 | 0 |
| Sengkang East | 180,193 | 0 |
| CCL | 338,807 | 338,807 |
| NSL | 234,637 | 234,637 |
| TEL | 798 | 798 |
| **Total** | **834,984** | **574,242** |

Twelve pattern cells gain passing candidates; no cells lose theirs. Unresolved
decisions move **184 → 172**, and unresolved pattern/date pairs **21,815 → 20,355**.
The net gain is 260,742 trip/date pairs. NEL, DTL, BPLRT and PGLRT have no
unresolved mapping dates in either run. The previous label-swap diagnostic left
574,607 unresolved pairs; this policy also preserves the 365 first-train pairs
that the swap had made conflicting.

Only Expo and Sengkang East pattern reviews change. The comparison verifies
identical pattern IDs, trip membership, source pattern hashes, complete stop
order and original/effective dates throughout. The three first-morning pattern
reviews and every other family's reviews are identical to the baseline. Every
original source table hash stays unchanged. Both evaluations are valid with
complete accounting, unresolved readiness, no mapping approval, and generation
ineligible. CCL dates/platforms, AMK boarding restrictions, terminal roles,
unusual paths and operational source conditions remain separate work. Apply
this accepted source-precedence reasoning to equivalent future reviews; this
focused policy does not silently activate overrides at other stations.

## Paya Lebar extension — 6 November 2026

Apply the [accepted source-precedence decision](#maintainer-decision--5-november-2026)
to Paya Lebar's known operational CCL platforms. The capture-specific
[allocation policy](gtfs-platform-allocation-policy-2026-11-02.json) adds
anticlockwise branch/loop services to literal A and clockwise branch/loop
services to literal B. Canonical A-clockwise/B-anticlockwise defaults and original
source labels remain intact. This transfers the maintainer's **Foldaway assumption**;
it does not prove temporary re-routing or operator confirmation.

### Evidence and scope

Both source children identify Paya Lebar through code `CC9` and parent `CC9`:
`CC9_A` explicitly labels A, and `CC9_B` explicitly labels B. Each resolves to
one existing physical platform in [canonical PYL](../data/station/PYL.json),
with no boarding restriction. Canonical A lists `CCL_BRANCH_CW`/`CCL_LOOP_CW`;
B lists `CCL_BRANCH_CCW`/`CCL_LOOP_CCW`. The reviewed topology adds only the
opposite branch/loop allocations to these two platforms. It changes no canonical
records, source stops, stop-time access fields, times, ordered paths or dates.

Every post–12 July unique-candidate CCL platform conflict in this capture is at
one of those two literal stops, with no boarding conflict. The existing validator
still requires a unique dated service and matching ordered path before checking
platforms; allowing both directions cannot select a service by platform preference.
The four added services have revisions beginning **12 July 2026**. They supply
no earlier service/code coverage. Earlier conflicts span 56 source stops and
legacy service scopes; those remain a separate review, rather than broadening
this policy to every CCL platform.

Representative source patterns preserve the complete journeys:

| Candidate | Pattern ID | Route / representative trip |
| --- | --- | --- |
| Loop clockwise | `3656ea0c3832628ace11fdce89e93ab6a36348396311fc9f404c5bd8ccfb19b9` | `CCL_CC11_CC32` / `CCL_Clockwise_PH_0004_0001` |
| Loop anticlockwise | `00136f828d2178d39313554bcf2951396353cb01b6d74ee375781e7aa5f124ff` | `CCL_CC11_CC33` / `CCL_Anticlockwise_PH_0015_0009` |
| Branch clockwise | `08e87799e2eaef7dab5ffdcbcb653c685904785cfb180c708b6ccd56acf377cf` | `CCL_CC1_CC11` / `CCL_Clockwise_PH_0018_0001` |
| Branch anticlockwise | `88f8a6aa7c0b35283c5c6b537e012a6349bce5fb87b9e3acd8508efb01d55d7a` | `CCL_CC1_CC11` / `CCL_Anticlockwise_WD_0064_0007` |

For example, the clockwise loop pattern retains `CC11_B → CC10_B → CC9_B →
CC8_B → CC7_B → CC6_B → CC5_B → CC4_B → CC34_B → CC33_B → CC32_B`.
The policy accepts its literal B at Paya Lebar without reversing the source
journey or asserting travel beyond the final listed station.

### Regenerated all-family comparison

Both runs use merged #458, canonical commit
`e9fb6439d1349d5482cea639e9045fff8a9de1c6`, canonical
[SG-2026](../data/public-holiday/SG-2026.json), and the unchanged
[holiday policy](gtfs-shared-holiday-policy-2026-11-02.json). The receipt, ZIP,
retrieval identity and LTA attribution are the same as in the original capture
comparison above.

Discovery checked on 6 November: the public root returned HTTP 403;
`index.html` was accessible but lists no captures or latest pointer. This review
therefore uses the pinned capture without claiming it is the latest available.
It contains 103 active routes, 19,140 recurring trips and 392 patterns, including
121 CCL patterns. The effective population stays **2,478,348 trip/date pairs**.

| Unresolved effective trip/date pairs | Expo/Sengkang policy v1 | With Paya Lebar v2 |
| --- | ---: | ---: |
| CCL | 338,807 | 227,321 |
| NSL | 234,637 | 234,637 |
| TEL | 798 | 798 |
| **Total** | **574,242** | **462,756** |

All other families remain at zero unresolved mapping dates. The gain is
**3,352 pattern/date pairs and 111,486 trip/date pairs across 56 CCL patterns**:
40,781 loop-clockwise, 39,667 loop-anticlockwise, 15,938 branch-clockwise and
15,100 branch-anticlockwise trip/date pairs. No previously passing date loses
its target. Unresolved pattern/date pairs fall **20,355 → 17,003**.
Unresolved decisions remain **172**: the gained later dates share patterns with
remaining earlier blockers, so the decision count is not a coverage count.

The remaining CCL blockers are disjoint by effective date:

| Cause | Pattern/date pairs | Trip/date pairs |
| --- | ---: | ---: |
| Dated revision/code gap, all before 12 July | 4,554 | 131,652 |
| Multiple dated service candidates, both sides of 12 July | 3,570 | 34,007 |
| Earlier legacy platform/service scope | 2,110 | 61,662 |
| **Total** | **10,234** | **227,321** |

No `CC30`–`CC34` code is backdated, and `CC33`/`CC34` are not rewritten to
`CE2`/`CE1`. No trip/date is dropped, no service is selected from platform
preferences, and no boarding restriction is waived. AMK, Marina South Pier,
unusual NSL/TEL paths and operational source-condition work remain separate.
Both evaluations are valid with complete accounting, unresolved readiness,
zero excluded dates, no approval, and mapping/generation eligibility false.
Assignment and release consumers still do not accept this review wrapper.

### Reproduce and verify

Use Node 24 with `TZ=UTC`, after `npm run build:fs`. Extract the v1 policy as
shown in the [original reproduction](#reproduce).
Run that all-family command twice with canonical commit
`e9fb6439d1349d5482cea639e9045fff8a9de1c6` and fresh output directories:
once with the extracted v1 policy, then with the checked-in v2 policy. Local
outputs are `/tmp/gtfs-ccl-baseline-20261106` and
`/tmp/gtfs-ccl-consolidated-20261106`; large generated packets remain outside Git.

Compare pattern IDs, trip membership, source-record hashes, complete stop order,
original/effective/added/removed dates and date scopes exactly. Compare each
review-cell claim by `(providerPatternId, serviceDate)`, since equivalent cells
can merge. Every pre-July claim, temporal gap/ambiguity, entity decision and
previous passing target is unchanged. All non-CCL pattern reviews are identical;
81 CCL patterns have changed platform diagnostics, including 25 whose service
ambiguity still prevents a proposal. The prior twelve allocation records and
all original source-table hashes are unchanged.

| Normalized wrapper identity | SHA-256 |
| --- | --- |
| Regenerated v1 baseline | `1f9fed41081606e23aea6c09950dbd8098c2e65544386507dbd791d9ce3a6c11` |
| Paya Lebar v2 | `6bb793480ab9b3b02c76c711dc361e8dbf3472dc5ad37575ac4a77bef8ffb79f` |

The canonical topology digest remains
`16f1700e9a37fedb3c08adeb762f4cf1832968d0acfd773a9a027f2ea80a7297`;
the v2 reviewed topology is
`af6c83b161d636a156b57fb7813daa45da0bbc44798dee8f0f9319e4cd12bf89`.
Policy/canonical changes require regeneration, not relabelling old approvals.

Validation under Node 24 with `TZ=UTC`: all 16 deterministic allocation, holiday
mapping and holiday-policy tests pass, as do the package build, lint, package
boundaries and documentation links. Real-capture before/after comparison checks
the invariants above; saved-review replay reproduces the review and evaluation
byte for byte. No model calls, approval, publication or canonical write occurs.

## Contract and safeguards

`createScheduledPlatformAllocationMappingDraft` takes the original verified
context, explicit platform policy, holiday policy and canonical holiday calendar.
Each allocation names a source stop, its exact literal platform label, canonical
station/line, additional known same-line services and review reason. Both
policies bind the original table manifest. The physical station/platform must
resolve uniquely; parent identity must be well formed. Duplicate source or
physical-platform rules, unknown/cross-line services, no-op additions and
slash-delimited alternatives are rejected. Unknown defaults stay unknown.

A separately identified review topology adds only the listed service allocations
to the fourteen explicitly listed platforms. The original topology is retained as the canonical
default; no canonical file changes. The wrapper records the original source and
canonical identity, both policy digests, the review topology digest, source-row
digests and canonical/reviewed service lists. Source tables are shared unchanged;
all stop IDs, literal labels, times, parents, station codes and dates are preserved.
This review topology is limited to this capture's effective date population;
it does not assert permanent canonical reallocation or prove historical routing.

`evaluateScheduledPlatformAllocationMapping` reconstructs that review topology
and reuses the existing [holiday mapping checks](gtfs-holiday-mapping-review.md).
Dated station codes, service revisions, exact ordered paths, operators, complete
platform groups and boarding restrictions still apply. Source precedence cannot
clear `not_in_service` or prohibited boarding at `alighting_only` platforms.
AMK's complete A/C and B/D alternatives cannot be narrowed through this policy.

The distinct `gtfs-platform-allocation-mapping-draft` contains the policy, change
evidence, date review and editable holiday mapping. A
`gtfs-platform-allocation-mapping-approval` must bind its exact digest and identity,
plus reviewer and reason. The maintainer's source-precedence decision is not
approval of the whole mapping. Approval is repository-review metadata, not
authentication, and no approval record is generated. Old label-swap, literal and
holiday approval formats cannot approve this wrapper; existing assignment and
release consumers do not accept it. Generation remains false even for a
synthetic fully resolved, approved review.

## Reproduce

Acquire the exact receipt and ZIP above. To reproduce this historical comparison,
first extract its original policy (the checked-in policy now includes Paya Lebar):

```sh
git show e9fb6439d1349d5482cea639e9045fff8a9de1c6:docs/gtfs-platform-allocation-policy-2026-11-02.json > /tmp/expo-sengkang-allocation-policy-v1.json
```

Use Node 24 with `TZ=UTC`, after `npm run build:fs`:

```sh
node scripts/draft-gtfs-scoped-review.mjs \
  /tmp/gtfs-current-capture-20261105/schedule.zip \
  /tmp/gtfs-current-capture-20261105/capture.json \
  NSL,EWL,NEL,CCL,DTL,TEL,BPLRT,SKLRT,PGLRT \
  /tmp/new-source-platform-review \
  --canonical-commit 987147261a35eb771bcae223f50cdbf6174a1899 \
  --holiday-policy docs/gtfs-shared-holiday-policy-2026-11-02.json \
  --holiday-calendar SG-2026 \
  --platform-allocation-policy /tmp/expo-sengkang-allocation-policy-v1.json
```

The runner writes `platform-allocation-review.json`,
`platform-allocation-evaluation.json` and `summary.json` into a new directory.
Large generated packets stay outside Git. For the baseline, omit the allocation
policy and choose another new directory. Reviewed edits use
`--platform-allocation-review <json>`; actual review metadata uses
`--platform-allocation-approval <json>`. These cannot mix with literal assignment
options or holiday-only review/approval files. Every run verifies the original
capture and committed canonical data first.

The original holiday mapping digest is
`b9c187430436afe511f8a30d9afb270f39d547d4ad4f6f821885cc56da98d946`;
the source allocation wrapper digest is
`37e7f1df452a974e6a2b5d9cf644fedfad0d331780395524384c0eb816064ca9`.
Regenerate after canonical or policy changes.
