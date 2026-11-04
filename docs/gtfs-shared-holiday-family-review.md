# Shared holiday family review — 4 November 2026

The [shared policy](gtfs-shared-holiday-policy-2026.json) applies the accepted
Sunday-on-public-holidays assumption to all nine compatible line families in
one review population. It carries the
[NEL decision](gtfs-nel-mapping-review-2026-10-28.md) and
[cross-line transfer](gtfs-cross-line-mapping-review-2026-10-28.md#holiday-families-one-policy-exception)
into explicit source bindings. This remains a Foldaway assumption; operator
confirmation that every full-day departure is identical has not been obtained.
The population and candidate results below supply no human approval,
assignment, release approval or publication eligibility.

## Exact inputs

Contains information from LTA DataMall's `GTFSScheduleTrain`, accessed
20 October 2026, under the
[Singapore Open Data Licence v1.0](https://datamall.lta.gov.sg/content/datamall/en/SingaporeOpenDataLicence.html).
MRTDown is independent of LTA.

The [receipt](https://sources.mrtdown.org/captures/schedule/9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a.json)
and [ZIP](https://sources.mrtdown.org/blobs/schedule/9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a.zip)
were reverified locally: SHA-256
`9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a`,
2,981,645 bytes. Capture recency is separate from policy validity.
The policy pins every original table hash and the normalized canonical
[SG-2026 calendar](../data/public-holiday/SG-2026.json) digest
`c1c3a740b0c17944e7d879bf7050b264ec28cf08ee146de3e039cae022b46ee6`.
Its revision is `foldaway-shared-sunday-public-holidays-2026-v1`.
No duplicate holiday list or remote calendar lookup is introduced.

The fresh review uses canonical commit
`1a6859aa67a9ad9d03663ceff4091ccf980b2b30`, the merged #449 baseline,
including the newer DTL/TEL revisions. The earlier NEL-only and post-CCK
reports retain their own canonical identities and are historical comparisons.

## Family coverage and short workings

All six original calendars have ordinary Monday–Friday, Saturday or Sunday
weekly rules with equal bounds, 1 January through 31 December 2026.
`calendar_dates.txt` contains its header and zero exception rows. No DTL/LRT
source adjustment requires a separate exception policy in this capture.

| Canonical family | Explicit active route IDs | Bound calendars |
| --- | ---: | --- |
| NEL | 3 | `SERVICE_WD`, `SERVICE_WE`, `SERVICE_PH` |
| NSL | 20 | Same ordinary triple |
| EWL, including both airport directions | 12 | Same ordinary triple |
| TEL | 15 | Same ordinary triple |
| CCL | 39 | `SERVICE_WD_CCL`, `SERVICE_WE_CCL`, `SERVICE_PH_CCL` |
| BPLRT | 1 (`BP`) | Ordinary triple |
| DTL | 6 | Ordinary triple |
| SKLRT | 1 (`SK`) | Ordinary triple |
| PGLRT | 1 (`PG`) | Ordinary triple |
| **Total** | **98** | **Six original calendars** |

Each family has trips in all three calendars collectively. Some individual
short workings have no trips for one or more day types: 8 NSL routes, 2 EWL,
1 TEL, 17 CCL and 3 DTL. Requiring all three calendars for every route would
prevent complete timetable substitution. For example `NSL_NS16_NS28` has
three weekday trips, `EWL_EW4_EW29` has 17 weekday trips, and `DTL_DT1_DT12`
has one Sunday trip. On a public holiday the first two have their weekday
selection removed; the Sunday-only DTL trip gains the holiday service date.
No absent trip is invented. The resolver therefore checks calendar coverage
across each explicit family while requiring every bound route to have trips
and use only that family's calendars.

Sixteen additional route declarations have no trips and remain preserved
metadata outside the active policy bindings: `NSL_NS1_NS7`, `EWL_EW2_EW29`,
`EWL_EW2_EW33`, `EWL_EW28_EW1`, `EWL_EW30_EW33`, `EWL_EW32_EW1`,
`CCL_CC1_CC23`, `CCL_CC1_CC26`, `CCL_CC1_CC29`, `CCL_CC1_CC4`,
`CCL_CC12_CC26`, `CCL_CC19_CC32`, `CCL_CC31_CC32`, `CCL_CC7_CC17`,
`CCL_CC7_CC23`, and `DTL_DT1_DT19`. They create no date population.

Shared `PH` names do not activate an implicit global rule. Each provider route
ID is bound explicitly in the policy. Any explicit source exception in a
bound calendar, unsupported weekly rule, missing family calendar, changed
source manifest or changed holiday digest continues to fail closed.

All substitution uses the original service date. A 24+ departure on the next
wall-clock day retains the previous service day's timetable. Existing Sunday
holidays occur once. Holiday-eve extras, engineering closures and absent source
dates require their own evidence; this policy infers none of them.

## Fresh populations and candidate checks

Topology projection 1 has digest
`16f1700e9a37fedb3c08adeb762f4cf1832968d0acfd773a9a027f2ea80a7297`.
The policy digest is
`a7d7199f102e9707d3d7faad85813533372082e561438c3191ae36632dffbe79`;
the resolved date-population digest is
`3647f4b9e8b0bad1ec487e1859085dff066a2069c0bc1896b9b6109e5b63b4cf`.
The generated holiday date-review draft digest is
`c97d18e31e270610f41aebe0f62a9357427f6da4a4ba96054189d1f63957fdeb`.
These identities describe the inspection draft, before any human mapping
review. Generated packets stay outside Git at
`/tmp/shared-holiday-derived-review-20261104` and
`/tmp/shared-holiday-literal-review-20261104`.

| Family | Literal trip/date pairs | Added Sunday pairs | Removed weekday/Saturday pairs | Effective pairs | Unresolved effective pairs |
| --- | ---: | ---: | ---: | ---: | ---: |
| NEL | 238,205 | 5,247 | 7,695 | 235,757 | 0 |
| NSL | 241,170 | 5,533 | 7,731 | 238,972 | 234,637 |
| EWL | 299,133 | 7,975 | 9,316 | 297,792 | 80,549 |
| TEL | 200,911 | 5,929 | 6,089 | 200,751 | 798 |
| CCL | 386,474 | 10,791 | 11,940 | 385,325 | 331,143 |
| BPLRT | 159,364 | 4,334 | 4,922 | 158,776 | 0 |
| DTL | 200,897 | 4,840 | 6,377 | 199,360 | 0 |
| SKLRT | 393,031 | 10,912 | 12,080 | 391,863 | 180,193 |
| PGLRT | 364,964 | 11,363 | 11,046 | 365,281 | 0 |
| **Total** | **2,484,149** | **66,924** | **77,196** | **2,473,877** | **827,320** |

All 388 source patterns are represented. The effective population has
1,646,557 trip/date pairs with passing candidate checks and 827,320 unresolved
pairs. It has 26,999 proposed and 21,313 unresolved pattern/date pairs.
These are candidate populations, not approved assignments or a coverage gain.
The three holidays already on Sundays add no duplicate dates. Ordinary
weekday/Saturday/Sunday calendars resolve to 251/51/63 dates respectively.

A fresh literal-source run against this same canonical identity reproduces
183 unresolved decisions and 1,653,370 proposed assignment trip/date pairs
out of 2,484,149, with 830,779 missing. Its full normalized draft digest is
`eda5c4cb5ffba6f86e3e9287b6f6973cf12cfcb8b39839b3c78fb6613619e8a2`.
Although those totals equal the older post-CCK totals, this is an independent
regeneration with the newer DTL/TEL canonical data and its own identity.
The holiday draft groups 242 unresolved review cells by distinct blockers;
those cells cannot be compared directly to literal-source unresolved decisions.

### Genuine remaining exceptions

- NSL retains 6,290 pattern/date pairs with platform/boarding blockers,
  including the complete AMK A/C and B/D alternatives and Marina South Pier
  terminal semantics, plus 365 pattern/date pairs with no temporal path.
  Reviewed AMK C/D passenger restrictions remain enforced.
- EWL retains six airport patterns and 730 pattern/date pairs with the literal
  Expo platform/service disagreement. Both airport directions participate in
  the holiday policy; substitution does not repair their source labels.
- CCL retains 13,084 unresolved pattern/date pairs: 5,334 temporal gaps,
  2,566 temporal ambiguities and 5,184 platform/boarding conflicts. The 12 July
  code/revision boundary remains enforced. Thirty-one proposed review cells
  cover 1,665 pattern/date pairs; those later candidates do not approve earlier
  dates or choose among ambiguous services.
- SKLRT retains six Sengkang East patterns and 730 pattern/date pairs with
  platform/service conflicts. The accepted Bakau/Rumbia direction evidence
  and documented same-line inference remain unchanged.
- TEL retains two no-path patterns, 114 pattern/date pairs and 798 trip/date
  pairs. The separate Marine Terrace Saturday timetable discrepancy remains
  evidence work even where geometric candidate checks pass.

NEL, DTL, BPLRT and PGLRT have no unresolved effective dates under the current
candidate checks. This does not establish historical platform allocation or
operational completeness. BPLRT's dated closures, holiday-eve extras and other
engineering changes remain separate evidence requirements even when this
capture's unmodified weekly calendars pass.

The whole-feed selector still requires every active source trip to have an
assignment for a selected date. Source admission, mapping approval, exact-date
assignment generation, release approval and public timetable publication remain
separate gates. No ignored rows, line exclusions, partial-date publication or
frequency fallback is introduced.

## Policy-aware mapping evaluation

The [shared mapping gate](gtfs-holiday-mapping-review.md) regenerates this
verified date-review input and applies the existing grouped mapping validation
to the effective dates. A fresh runner packet at
`/tmp/shared-holiday-mapping-review-20261104` has normalized mapping draft digest
`a544c5bdfb5dae613a930da78184bbfd629d3c00f10a762fd3e159e79f7ccda2`.
Its evaluation is valid with complete source/date accounting, 183 unresolved
decisions, 26,999 matched and 21,313 unresolved pattern/date pairs, no exclusions
and no approval. Readiness is `unresolved`; both mapping review eligibility and
generation eligibility are false. Complete accounting means every source record
and effective date has a decision; it does not mean those decisions are resolved
or approved.

## Reproduce

Build `@mrtdown/fs`, then run under Node 24 with `TZ=UTC` against the verified
local capture and a fresh output directory:

```sh
node scripts/draft-gtfs-scoped-review.mjs \
  /tmp/amk-correction-input-20261029/schedule.zip \
  /tmp/amk-correction-input-20261029/capture.json \
  NSL,EWL,NEL,CCL,DTL,TEL,BPLRT,SKLRT,PGLRT \
  /tmp/new-shared-holiday-review \
  --canonical-commit 1a6859aa67a9ad9d03663ceff4091ccf980b2b30 \
  --holiday-policy docs/gtfs-shared-holiday-policy-2026.json \
  --holiday-calendar SG-2026
```

The runner verifies committed canonical data and capture bytes. It writes the
exact original/effective dates, candidate evidence and source/canonical/policy
identities outside Git. For a literal-source diagnostic comparison, use a
separate fresh directory, omit the two holiday options and pass
`--platform-groups --blockers --assignments`. Literal proposals retain their
literal-source contract and do not approve holiday-derived dates.
