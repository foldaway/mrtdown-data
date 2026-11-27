# Joo Koon service selection proposal (27 November 2026)

**Status: proposed, not approved or published.** Keep the canonical
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
That digest is **not** a publishable release identity because no new mapping
approval was supplied. The official LTA licence and API terms fetched on
27 November matched the completed release's recorded hashes; publication must
fetch them again.

Review the eight exact selections and scope before recording a new mapping
approval and release review. Because the source ZIP is unchanged while the
mapping changes, source admission also requires a `correction` review and an
increase from correction revision 1 to 2. Then create the first
reviewed `releases/gtfs.json`, run the Pages preview against that definition,
merge it, and verify public deployment, site import and retention. Updating the
old approval hashes alone would not review the new service bindings.
