# Expo and LRT platform allocation review — 31 October 2026

The next 18 unresolved pattern/date cells cover Expo, both Choa Chu Kang
occurrences and Sengkang East's five intermediate stations. Photographs support
Expo's existing canonical directions. The LRT evidence has narrower limits:
Choa Chu Kang's signs distinguish boarding from alighting, while the inspected
Sengkang East photos do not establish all five stations' directions.

This packet records evidence and the remaining decisions. It changes no source
rows, canonical platforms, mappings, calendars or eligibility rules.

## Exact affected population

Regenerated against merged [PR #444](https://github.com/foldaway/mrtdown-data/pull/444),
commit `1788292457da1f02ddaf29b4209f4ed5c178def7`, using the pinned
[21 October capture](https://sources.mrtdown.org/captures/schedule/9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a.json)
and [original ZIP](https://sources.mrtdown.org/blobs/schedule/9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a.zip).
The source SHA-256 is
`9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a`
(2,981,645 bytes). LTA attribution and licence are in the
[public handoff](gtfs-public-handoff.md).

| Scope | Pattern/date cells | Recurring trips | Pattern/date pairs | Trip/date pairs | Conflicting occurrence indices |
| --- | ---: | ---: | ---: | ---: | --- |
| Expo | 6 | 675 | 730 | 80,453 | 1, between Tanah Merah and Changi Airport |
| Choa Chu Kang | 6 | 1,248 | 730 | 159,364 | **0 and 18**, preserving both terminal visits |
| Sengkang East | 6 | 1,491 | 730 | 180,151 | 1–5, preserving both Sengkang town-centre visits |

These disjoint sets total **18 cells, 3,414 trips and 419,968 trip/date pairs**.
All remain unresolved. Every trip's route, calendar and complete ordered stop
list was joined back to the ZIP. Affected occurrences have ordinary/default
pickup and drop-off, with no source instruction prohibiting boarding.
WD contributes 261 dates, WE 52 and PH 52 over literal 2026 calendars; the
accepted Sunday-on-public-holiday policy is still a separate implementation.
The [cross-line appendix](gtfs-cross-line-mapping-review-2026-10-28.md#no-path-traces-and-exact-smaller-exception-cells)
lists all 18 cell keys and representative trips.

## Expo: evidence supports retaining the canonical allocation

Canonical [Expo](../data/station/XPO.json) assigns A to `EWL_CG_E` toward
Changi Airport and B to `EWL_CG_W` toward Tanah Merah. Both are directly
maintained records, without a same-line inference. Their last review date is
21 July 2026, not a dated observation of every supplied service.

| First-hand photograph | Visible operator signage |
| --- | --- |
| [ZKang123 / zhenkang, 27 June 2020, platform A](https://commons.wikimedia.org/wiki/File:CG1_Expo_Platform_A.jpg) | A beside an onward route strip to Changi Airport. |
| [ZKang123 / zhenkang, 27 June 2020, platform B](https://commons.wikimedia.org/wiki/File:CG1_Expo_Platform_B.jpg) | B beside the route strip through Tanah Merah toward the main EWL. |
| [LN9267, 12 August 2025](https://commons.wikimedia.org/wiki/File:Expo_Station_East_West_Line_Changi_Airport_Branch_Line_platform_12-08-2025%281%29.jpg) | B and the direction Tanah Merah on the same platform-door sign; Changi Airport appears behind the origin on the route strip. |

The October source does the reverse: eastbound `CG1_A` explicitly labels B,
and westbound `CG1_B` labels A. Its parent is `CG1` in both cases. Physical
identity follows those literal labels; the stop-ID suffix cannot replace them.

**Recommendation:** retain the canonical A/east and B/west bindings and keep all
six source conflicts visible. These observations strengthen a provider-label
investigation; they do not prove an unchanged allocation on every 2026 date or
authorize rewriting the source. A dated change notice or provider clarification
would be needed to explain the reverse assertion.

## Choa Chu Kang: separate service allocation from boarding infrastructure

Canonical [Choa Chu Kang](../data/station/CCK.json) assigns platforms 1/3 to
`BPLRT_B` via Petir and 2/4 to `BPLRT_A` via Senja, without boarding restrictions.
The feed instead uses literal platform 1 at both ends of every Service A trip,
and literal platform 2 at both ends of every Service B trip.

Two photographs by ZKang123 / zhenkang, dated 17 February 2021, narrow the question:

- [Platform 1](https://commons.wikimedia.org/wiki/File:BP1_Choa_Chu_Kang_LRT_Platform_1_20210217_155346.jpg)
  displays Service B via Petir, with passengers boarding. This supports one
  observed B/1 departure, not an exclusive or permanent B/1 allocation.
- [Platform 4](https://commons.wikimedia.org/wiki/File:BP1_Choa_Chu_Kang_LRT_Platform_4_20210217_155442.jpg)
  has a notice directing passengers to board at platform 1 or 2. The temporary
  out-of-service display in the image supplies no permanent status for 2026.

**Recommendation:** obtain current station-specific confirmation of which
services can board at **each of 1 and 2**, and separately review the restrictions
on **each of 3 and 4**. The current service-only records do not describe the
observed boarding distinction. Do not swap A/B, grant both services to both
boarding platforms, or mark both outer faces from one photograph alone.

The initial occurrence already conflicts. An alighting-only rule at the final
occurrence cannot resolve that initial conflict, and the feed's repeated 1/2
must not be silently changed to 3/4. Any subsequent correction must preserve
the complete 19-occurrence path and assess pickup/drop-off at both ends.

## Sengkang East: revisit the two observation roots

The canonical clockwise service runs
`SKG → CPV → RMB → BAK → KGK → RNG → SKG`; counterclockwise reverses it.
At every intermediate station, platform 1 lists `SKLRT_E_CW` and 2 lists
`SKLRT_E_CCW`. Eight of those ten bindings are inferred: platform 1 traces to
directly maintained `BAK_SKLRT_1`, and platform 2 to `RMB_SKLRT_2`.
The October feed uses literal 2 clockwise and 1 counterclockwise at all five.

The inspected [Bakau photograph, 21 July 2020](https://commons.wikimedia.org/wiki/File:SE3_Bakau_Platform_1_20200721_111814_1.jpg)
shows station identity but no readable platform-direction pairing. The
[Rumbia photograph, 30 May 2018](https://commons.wikimedia.org/wiki/File:SE2_Rumbia_Platform_2.jpg)
shows platform 2; its small route diagram is insufficient here to authenticate
the complete direction and date allocation. Both photographs are by
ZKang123 / zhenkang. Their titles alone cannot supply the missing directions.

**Recommendation:** recheck the Bakau 1 and Rumbia 2 observation roots with
readable station-specific signs, then verify the inferred members at Compassvale,
Kangkar and Ranggung. Sengkang town-centre changes do not establish these
allocations. Keep all five intermediate conflicts and both town-centre visits;
neither a blanket label swap nor a town-centre platform rule is supported.

## Maintainer input — 31 October

| Scope | Supplied review input | Effect on this review |
| --- | --- | --- |
| Choa Chu Kang | “I believe so” in response to both services boarding at either 1/2 and 3/4 being alighting-only. | Tentative recollection of that arrangement, retained for a later canonical correction review. It does not establish an exclusive service allocation or historical validity over all 2026 dates. |
| Bakau | “Platform 1 is East Loop.” | Confirms the loop association as supplied review context; the next station/direction remains unspecified. |
| Rumbia | “same, Platform 1 is East Loop.” | Same limit: both canonical directions serve the East Loop. It does not yet select clockwise versus counterclockwise or revise the platform 2 observation root. |
| Expo | “I think so?” about A toward Changi Airport and B toward Tanah Merah. | Tentative agreement, alongside the independent photographs above; the source conflict remains unresolved. |

These are maintainer statements, with their expressed uncertainty preserved.
For Sengkang East the remaining clarification is the next station from platform 1:
Bakau toward Kangkar or Rumbia, and Rumbia toward Bakau or Compassvale.
No canonical allocation or digest-bound mapping approval is supplied here.

## Reproduction and evidence integrity

All seven cited photographs were downloaded and their pixels inspected.
Dates are author-recorded metadata; they are observations, not operator-issued
all-year allocation statements. Each linked file page identifies its author
and CC BY-SA 4.0 licence. Originals and inspection crops remain outside Git.
Newer Choa Chu Kang/Rumbia originals returned HTTP 429 and were not inspected;
no conclusion relies on their captions or thumbnails.

| Original | SHA-256 | Bytes |
| --- | --- | ---: |
| Expo A, 2020 | `ed1ea9b145ae8079606a6679810a386ee74f963d2f1286089a7fb599b0b13675` | 3,952,173 |
| Expo B, 2020 | `e003e12157d575534f39fce34eccb68fcd1fb24117dda2ccb80b5707966115e4` | 3,914,833 |
| Expo B, 2025 | `da38e813958b4141a297111ea3d0461776d8e16c60afdef9ec18b81a4b66d800` | 11,961,759 |
| Choa Chu Kang 1, 2021 | `77d72d0d04bd72afcc6f4e0a5d4cda0127c856eebcc88b6c533d2820496d3801` | 3,774,631 |
| Choa Chu Kang 4, 2021 | `fa6489a08eb3954f1ba43b615a19616fd9a8e9a584349d4604194f16853f7e95` | 3,380,155 |
| Bakau, 2020 | `39077e92f3a4325af37a09b29d4a2d26de8d789c2bb46765d8a551c1bd825953` | 4,421,003 |
| Rumbia 2, 2018 | `99a953f3411bacb52240ef2c357fd32f824f45de04326b810bc1e35ef6865824` | 5,499,307 |

With the pinned receipt/ZIP downloaded as in the [NEL instructions](gtfs-nel-mapping-review-2026-10-28.md),
build the CLI and regenerate using committed data at the merge above:

```sh
npm run build:cli
TZ=UTC node scripts/draft-gtfs-scoped-review.mjs \
  /tmp/nel-review-input-20261028/schedule.zip \
  /tmp/nel-review-input-20261028/capture.json \
  NSL,EWL,NEL,CCL,DTL,TEL,BPLRT,SKLRT,PGLRT \
  /tmp/platform-allocation-review-20261031 \
  --canonical-commit 1788292457da1f02ddaf29b4209f4ed5c178def7 \
  --platform-groups --blockers --assignments
```

Select blocker patterns containing `CG1_A/B`, `BP1_A/B` or `SE1_A/B` in
`stopIds`; join `dateSetId` to the full draft's `dateSets`. Join **every**
`tripIds` member to source trips and stop-times, sorting occurrences by numeric
`stop_sequence`. This reproduces the population above without selecting only
convenient examples. Generated packets remain outside Git.

| Regenerated identity | SHA-256 |
| --- | --- |
| Topology projection 1 | `02ebd83efd71e0facbe7b34ecb374ec0fbec62b581db56417bfc4ede88b3365f` |
| Normalized full draft | `9b5219384f880c13984d74ad71d4b2a8a8dc6dba33cb6f9a4275837bb4c37aa4` |
| Blocker bytes, 4,244,923 bytes | `920e426a56f04f25c0b51c53ea336238204d829542d3866aed9ce03214172ee2` |
| Normalized assignments | `ad4756a9ba792ac3afeb0af55efaed2eff3387e7613413687db73d2989a351b9` |

Full accounting and assignment validation pass. There are still **189 unresolved
decisions and 990,143 unassigned trip/date pairs**. Mapping review and generation
eligibility remain false. This evidence review recovers no departures; canonical
corrections, occurrence semantics, holiday overrides and publication need their
own reviewed changes.

Validation: CLI build, lint, documentation links and 74 existing grouped-platform,
grouped-review and blocker tests passed with Node 24 and `TZ=UTC`.
