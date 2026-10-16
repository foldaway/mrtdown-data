# GTFS mapping disagreements

This is a review queue for the October schedule
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`
and the canonical topology identified in the
[reconciliation audit](gtfs-reconciliation-audit.json). Findings are proposed,
not approved mapping decisions. No canonical correction or source repair is
justified solely by a disagreement between these two inputs.

## Circle Line date boundary

[LTA's Circle Line 6 project page](https://www.lta.gov.sg/content/ltagov/en/upcoming_projects/rail_expansion/circle_line_6.html)
records passenger-service opening on 12 July 2026 and the three stations closing
the HarbourFront–Marina Bay gap. This supports retaining the canonical July 12
boundary. It does not authenticate each all-year provider calendar or prove that
a post-opening loop pattern operated before the boundary. Date-scoped evidence
must preserve a gap when no valid revision covers a supplied service date.

## Platform evidence

| Scope | Established evidence | Disposition and evidence still needed |
| --- | --- | --- |
| Expo | Retained provider stop IDs `CG1_A`/`CG1_B` swap `platform_code` between August and October. Canonical A serves `EWL_CG_E`, B serves `EWL_CG_W`. October eastbound trips use the stop now labelled B, and westbound trips use the stop now labelled A. | Keep six pattern conflicts unresolved. Obtain dated operator platform-direction evidence or a provider correction. Matching the stop-ID suffix would conceal the explicit label disagreement. |
| Choa Chu Kang | October `BP1_A` (platform 1) occurs at both ends of Service A paths via Senja; `BP1_B` (platform 2) occurs at both ends of Service B paths via Petir. Canonical 1/3 list B; 2/4 list A. | Keep six pattern conflicts unresolved. Verify which boarding platforms can serve each loop and separately verify alighting-only platforms. A timetable's repeated terminal stop does not establish boarding/alighting infrastructure. |
| Sengkang East intermediate stations | October clockwise paths via Compassvale use platform 2; counterclockwise paths via Ranggung use platform 1 at SE1–SE5. Canonical scope is the reverse, rooted in direct Bakau/Rumbia observations and same-line inference. | Keep six pattern conflicts unresolved. Verify station-specific physical labels and direction. Evidence about Sengkang town-centre platform changes does not establish labels at SE1–SE5. |
| Marina South Pier | Four southbound patterns end at `NS28_A`, mapped by label to canonical A, whose scope lists the northbound service. The conflict is only at the final occurrence. | Distinguish terminal arrival from a boardable southbound departure. Confirm turnaround and occurrence pickup rules before changing canonical service scope or dropping the conflict. |

Canonical platform provenance is described in
[station layout](plans/active/station-layout-data.md): records without
`inference` use personal observation/recollection; explicit inference records
name their observed basis. These are independently maintained records, not
copies of the GTFS platform labels. In particular, changing an inferred record
requires revisiting its basis rather than making the feed its implicit source.

Official documents help bound the investigation but do not resolve the conflicts:

- [SMRT lift-upgrade schedule](https://www.smrt.com.sg/getmedia/4dc714c8-1a2c-4cf7-ac49-e5ea12425ab1/Annex-B-%E2%80%93-Further-details-and-schedule-of-lift-upgrading-work.pdf)
  distinguishes stem stations from loop stations: its loop rows identify platform
  1 with Service B via Petir and platform 2 with Service A via Senja. Its Choa
  Chu Kang row says both directions and does not assign A/B to platforms there.
  Applying the loop-station rule at the terminus would be an unsupported inference.
- [LTA's Sengkang enhancement announcement](https://www.lta.gov.sg/content/ltagov/en/newsroom/2023/12/news-releases/the-rail-report-construction-in-full-swing-for-jrl-crl.html)
  describes separate loop boarding locations at Sengkang town centre. It does
  not establish Compassvale, Rumbia, Bakau, Kangkar or Ranggung platform labels.
- [SBS Transit's historical maintenance schedule](https://www.sbstransit.com.sg/Uploads/files/annex_maintenance_works_schedule_apr_2016.pdf)
  explicitly concerns 2015–2016 town-centre departures. It cannot authenticate
  2026 intermediate-station labels or override later layout changes.

These links were inspected on 2026-10-14; their stated periods and station scope
remain part of the evidence. No external photo, station plan or platform dataset
is imported into canonical records by this investigation.

## Unmatched source occurrences

All five unmatched patterns are structurally valid under the current audits.
The following exact trip IDs locate the source rows; keep their original times
and ordered stop occurrences. No missing times are interpolated as a repair.

| Provider route/calendar | Affected trips | Source trace and unresolved question |
| --- | --- | --- |
| `NSL_NS13_NS28` / `SERVICE_WD` | `NSL_SB_WD_203_3103` | Sequence 1 departs `NS13_B` at `5:29:39`; sequence 2 arrives `NS18_B` at `5:45:03`. NS14–NS17 are absent. Confirm missing stop-time rows versus a documented skip-stop operation. |
| `NSL_NS13_NS28` / `SERVICE_WE` | `NSL_SB_WE_203_4559` | Sequence 1 departs `NS13_B` at `5:34:18`; sequence 2 arrives `NS18_B` at `5:49:47`. Same unresolved omission. |
| `NSL_NS16_NS1` / `SERVICE_PH` | `NSL_NB_PH_210_5334` | Starts `NS16_A, NS20_A, NS21_A, NS20_A, NS19_A, NS18_A`. Preserve the excursion and repeated NS20 occurrence. Confirm the intended stop sequence before selecting a northbound canonical path. |
| `TEL_TE1_TE29` / `SERVICE_PH` and `SERVICE_WE` | Seven per calendar: `TEL_CB_<calendar>_103_0101`, `104_0139`, `105_0177`, `125_0874`, `142_0891`, `143_1101`, `144_1117` | Here `<calendar>` is `PH` or `WE`; the suffixes after the first entry retain the same `TEL_CB_<calendar>_` prefix. All fourteen omit `TE22_A`. The `103_0101` example departs `TE20_A` at `18:00:25` and arrives `TE23_A` at `18:06:41`. Confirm omitted rows versus a documented station bypass. |

[LTA's TEL station list](https://www.lta.gov.sg/content/ltagov/en/upcoming_projects/rail_expansion/thomson_east_coast_line.html/1000)
includes Gardens by the Bay in Stage 3 and Tanjong Rhu in Stage 4. That supports
retaining the canonical station in the ordinary path; it does not prove the
stop behavior or missing time of an individual trip. The closed future stations
Marina South and Founders' Memorial are separate from the omitted Gardens by
the Bay stop.

`SERVICE_PH` is the provider identifier. The October calendar enables Sunday
service with no exception rows; its name alone does not establish public-holiday
applicability. None of the five representative trip IDs above occurs in the
August `trips.txt`, so those exact IDs cannot supply a historical correction.

The default disposition for these 17 trips is unresolved. Any later reviewed
exclusion must record its affected scope and resulting coverage gap. Neither
silently deleting supplied occurrences nor adding unobserved scheduled stops is
an acceptable way to make the sequence matcher succeed.
