# Review GTFS platform allocations

GTFS names the platform for a scheduled trip. Canonical platform/service bindings
provide Foldaway's usual direction defaults. For the reviewed Expo and Sengkang
East stops, an explicit capture-specific policy now lets the GTFS allocation take
precedence over that default. Source labels and canonical records stay intact.

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

The normal canonical directions also remain valid in the review. Expo's first
morning Tanah Merah-bound train uses `CG1_A`, labelled B, so it continues to pass.
The weekday/Saturday variant departs Expo at 05:36:59; the Sunday/public-holiday
variant at 06:04:58. Each runs the full Changi Airport → Expo → Tanah Merah route.
All ordinary airport-bound trips use that same Expo stop, and later westbound
trips use `CG1_B`. A blanket label swap had made these first trains conflict;
source precedence preserves both timetable variants.

## Capture comparison

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
to those twelve platforms. The original topology is retained as the canonical
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

Acquire the exact receipt and ZIP above. Use Node 24 with `TZ=UTC`, after
`npm run build:fs`:

```sh
node scripts/draft-gtfs-scoped-review.mjs \
  /tmp/gtfs-current-capture-20261105/schedule.zip \
  /tmp/gtfs-current-capture-20261105/capture.json \
  NSL,EWL,NEL,CCL,DTL,TEL,BPLRT,SKLRT,PGLRT \
  /tmp/new-source-platform-review \
  --canonical-commit 987147261a35eb771bcae223f50cdbf6174a1899 \
  --holiday-policy docs/gtfs-shared-holiday-policy-2026-11-02.json \
  --holiday-calendar SG-2026 \
  --platform-allocation-policy docs/gtfs-platform-allocation-policy-2026-11-02.json
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
