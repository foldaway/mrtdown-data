# Joo Koon service selection and release review (27 November 2026)

**Status: mapping, release, and source correction approved by Duncan Leo on 27
November 2026. Pages published the reviewed bytes; site import and retention are
pending recovery.** Keep the canonical
`EWL_MAIN_W_JKN` service added by PR #510. The [Pages deployment](https://github.com/foldaway/mrtdown-data/actions/runs/45976035917)
stopped before upload because the retained release's shared claims bind an older
base mapping. The existing release approval cannot authorize a timetable built
against the new topology.

The verified source capture is
`0a5cf996038a088933b35d3ba81c76258b986946eed6ac628be4724d4f6e48bf`.
The canonical tree at `fa304182d193d8845a39bc38b8bf728d515a8f78` has topology
SHA-256 `8c39ec390ab2c4ae978442aac8f09cb6752719282e49203bef4cacd7aafe8245`.
The retained claims bind base draft `546e567eca408f7d09cfc4c50763c61fe13e8d56955604c5b7efdf4dee79a5df`;
regeneration gives `f02c3a1384e906f68e7a0a3e7ce142df036119aab17de1e546a2cd244accc3fd`.

## Source evidence and proposed decision

Eight source patterns now have two dated canonical candidates:
`EWL_MAIN_W` (the through Tuas Link service) and `EWL_MAIN_W_JKN` (the Joo Koon
short working). All eight source paths end at EW29 Joo Koon, and every trip in
them has the Joo Koon headsign. Six start at EW1; two start at EW4. The source
route and complete stop sequence establish the destination; the headsign agrees.
The [exact pattern IDs, dates and targets](policies/gtfs-joo-koon-service-selections-2026-11-27.json)
propose selecting only `EWL_MAIN_W_JKN` for these trip/date pairs.

| Source span | Day types | Patterns | Trip/date pairs | Joo Koon match |
| --- | --- | ---: | ---: | --- |
| EW1–EW29 | public holiday, weekday, weekend | 6 | 2,384 | exact |
| EW4–EW29 | public holiday, weekday | 2 | 325 | contiguous segment |

The selected dates are within the existing November 2026 applicability window.
The 56 earlier shared memberships remain as they were, apart from the required
new base draft binding. The new selections do not turn these short workings into
members of both EWL services.

## Checks and remaining review

With the proposal applied, the regenerated combined draft is
`37173de8c16b2ef59a78d0b40619f79fc4c662f784f2119bdf81bebe15a20d36`.
It has 149,100 supported trip/date pairs, zero unresolved pairs and zero
exclusions. The full assignment artifact accounts for all 149,100 pairs with
zero gaps; 2,709 pairs belong to `EWL_MAIN_W_JKN`. Its inspection artifact is
`e5e3ae7f4c59f45c78d46441012e79a2f6db480febf5e1c3358152d8135ed3a4`.
That digest preceded mapping approval and is **not** the approved release
identity. The maintainer approved the eight exact selections on 27 November.
The bound mapping approval has SHA-256
`2cf6ac3a2ed5b1cb9cea01321e42ca00b92c64ec72dcf9ee44cf30a07dc7028c`.
Its candidate manifest is
`8de88834536757d97f8b2f484e4497cc3fd9af83120e40f3bde7bc0450c4bebc`,
with correction revision 2 and timetable SHA-256
`512f81584b9d89aa4cce2d6db8912330efa81bf74b9ccd431a8c69353f8bef23`.
The official LTA licence and API terms fetched at 17:56 UTC on 27 November
matched the completed release's recorded hashes. Publication must fetch them
again.

The approved release review names Duncan Leo as reviewer, the candidate manifest
above, mapping approval SHA-256 above, and decision `release-permitted`. It records
Singapore Open Data Licence v1.0 and the current official term hashes:
`837c008a702a6e11c2cea5884bc39d07e9758cf10efe0c0e4389956e5f20f7d2`
for the licence and
`6769fd5f94090b3c20ae2ee5754c2408a645c97d699e329189dbed4be672bfc8`
for API terms. It carries the prior attribution obligations: credit LTA DataMall
and GTFSScheduleTrain with source access time and licence link; identify MRTDown
mappings separately under CC-BY-4.0, avoid implied LTA endorsement, and protect
account credentials. The confirmed capture condition is that this is the same
verified LTA train endpoint and ZIP with redistribution permission, unchanged
terms, no newly communicated restriction and no release embargo (`effectiveAt:
null`). Duncan Leo confirmed these conditions for this exact release.

The approved source admission review names Duncan Leo as reviewer and decision
`correction`, increasing correction revision 1 to 2. Its reason is that the
unchanged verified source is rebound to the newly approved canonical Joo Koon
mapping with full trip/date coverage. The predecessor manifest is
`8aece4578b324d12076a97730a62f678390e1f525b0612d69ff3d1c310ddf847`;
the successor is the candidate manifest above, with the same verified source
SHA-256. Both reviews were recorded at `2026-11-27T18:00:44.463Z`. The first
reviewed `releases/gtfs.json` contains the exact approved release evidence,
whose SHA-256 is
`bc69dc3123e58f8bb770c113c1900f1eb0bc7d233b8f851972237cea143d9665`.
Its local Pages build completed with freshly fetched matching terms and a
release instant of `2026-11-27T18:01:22.645Z`.
PR #511 passed its Pages preview and merged. The [main deployment](https://github.com/foldaway/mrtdown-data/actions/runs/46053925481)
published and verified the exact release index, but its site pull failed because
the production site still pinned the predecessor index. The site import rejected
the request before changing timetable data; retention remained on the predecessor.
Update the site's durable production pin to this approved index, then retry the
exact release and require a completed site receipt before advancing retention.
Updating old approval hashes alone would not review the new service bindings.
