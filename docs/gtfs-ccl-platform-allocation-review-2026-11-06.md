# CCL source platform allocation review — 6 November 2026

Apply the [accepted source-precedence decision](gtfs-source-platform-allocation-review.md#maintainer-decision--5-november-2026)
to Paya Lebar's known operational CCL platforms. The capture-specific
[allocation policy](gtfs-platform-allocation-policy-2026-11-02.json) adds
anticlockwise branch/loop services to literal A and clockwise branch/loop
services to literal B. Canonical A-clockwise/B-anticlockwise defaults and original
source labels remain intact. This transfers the maintainer's **Foldaway assumption**;
it does not prove temporary re-routing or operator confirmation.

## Evidence and scope

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

## Regenerated all-family comparison

Both runs use merged #458, canonical commit
`e9fb6439d1349d5482cea639e9045fff8a9de1c6`, canonical
[SG-2026](../data/public-holiday/SG-2026.json), and the unchanged
[holiday policy](gtfs-shared-holiday-policy-2026-11-02.json). The original verified
[receipt](https://sources.mrtdown.org/captures/schedule/ceb07f9c91de86559212eb48c1feac6455452900fad49cf009414a66c2f17efe.json)
and [ZIP](https://sources.mrtdown.org/blobs/schedule/ceb07f9c91de86559212eb48c1feac6455452900fad49cf009414a66c2f17efe.zip)
bind SHA-256 `ceb07f9c91de86559212eb48c1feac6455452900fad49cf009414a66c2f17efe`,
2,996,770 bytes, retrieved `2026-11-02T20:00:07.575Z`, provider timestamp null.
Contains information from LTA DataMall under the Singapore Open Data Licence
v1.0; [attribution and source conditions](gtfs-public-handoff.md) apply.

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

## Reproduce and verify

Use Node 24 with `TZ=UTC`, after `npm run build:fs`. Extract the v1 policy as
shown in the [original reproduction](gtfs-source-platform-allocation-review.md#reproduce).
Run that all-family command twice with canonical commit
`e9fb6439d1349d5482cea639e9045fff8a9de1c6` and fresh output directories:
once with the extracted v1 policy, then with the checked-in v2 policy. Local
outputs are `/tmp/gtfs-ccl-baseline-20261106` and
`/tmp/gtfs-ccl-policy-20261106`; large generated packets remain outside Git.

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
| Paya Lebar v2 | `005abad7d4b6c00987f56e53c4dc263c2928002fb9dd7d18db9b9411dbb678f3` |

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
