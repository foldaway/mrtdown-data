# TEL5 and DTL3e opening announcement

Reviewed on 4 November 2026.

## Sources

- [CNA: Bedok South, Xilin and Sungei Bedok MRT stations to open on Dec 26](https://www.channelnewsasia.com/singapore/new-mrt-stations-sungei-bedok-xilin-tel-dtl-6516651), published 4 November 2026.
- [LTA: TEL5 and DTL3e passenger service opening](https://www.lta.gov.sg/content/ltagov/en/newsroom/2026/11/news-releases/tel5-dtl3e-passenger-service-26-dec-2026.html), published 4 November 2026.
- [LTA Annex C: About TEL5 and DTL3e stations](https://www.lta.gov.sg/content/dam/ltagov/news/press/2026/261104-about-tel5-and-dtl3e-stations-AnnexC.pdf), confirming Sungei Bedok as the eastern terminus of both lines upon opening.

## Canonical changes

Passenger service starts on **26 December 2026**. Replace the 31 December
2026 placeholder in these station-code records:

| Station | Station ID | Codes |
| --- | --- | --- |
| Bedok South | BDS | TE30 |
| Sungei Bedok | SGB | TE31, DT37 |
| Xilin | XLN | DT36 |

Add service revisions beginning on that date for both TEL and DTL directions:

- TEL southbound extends from Bayshore through Bedok South to Sungei Bedok;
  northbound follows the reverse path to Woodlands North.
- DTL eastbound extends from Expo through Xilin to Sungei Bedok;
  westbound follows the reverse path to Bukit Panjang.

The previous revisions end on the same date, using the repository's exclusive
end-date convention. Before opening, the existing Bayshore and Expo termini
remain active. The extended paths contain 29 TEL and 37 DTL stations in each
direction, matching LTA's announced operational station counts. Mount Pleasant
and Marina South remain absent from the TEL passenger-service paths.

## Timing assumptions and scope

The announcement does not provide new service operating hours, headways, or
station first/last-train times. Each new revision retains its predecessor's
required `operatingHours` as a provisional continuity assumption. The existing
`estimatedFrequency` profiles also carry forward their original LTA system-wide
guidance and retrieval date; they are estimates, not confirmed extension
timetables. Recheck both when operators publish opening schedules. No new
station first/last-train times or platform allocations are inferred.

The future paths and opening dates do not approve or publish a GTFS timetable.
This opening announcement does not create a disruption, maintenance, or
infrastructure issue record. Journey-time examples, autonomous vehicle reports,
and electric-bus announcements in the article are outside this rail-data update.
