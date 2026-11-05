# GTFS blocker triage after shared holiday review

The fresh all-line review separates passenger-service disagreements from one
unused source declaration. The first fix accounts for that declaration without
inventing an operator mapping. It resolves one metadata decision, **183 → 182**,
and leaves all **827,320 unresolved effective trip/date pairs** visible.

## Inputs and the declaration fix

Both runs use merged [PR #456](https://github.com/foldaway/mrtdown-data/pull/456),
canonical commit `4b117172c1f9a0f3e529f510d5b28eeecd67fcaa`, the
[shared holiday policy](gtfs-shared-holiday-policy-2026.json) and canonical
[SG-2026](../data/public-holiday/SG-2026.json). The original
[receipt](https://sources.mrtdown.org/captures/schedule/9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a.json)
and [ZIP](https://sources.mrtdown.org/blobs/schedule/9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a.zip)
are unchanged: SHA-256
`9a4271536f4bee1d690b10c887fcd0063875a36f3918543d2e32e21ac4dc7e4a`,
2,981,645 bytes. LTA attribution and licence are recorded in the
[family review](gtfs-shared-holiday-family-review.md#exact-inputs).

The source declares agencies `LTA`, `SMRT` and `SBST`. Of all 114 declared routes,
102 reference SMRT and 12 reference SBST; **none references LTA**. This checks
every declaration, including the 16 routes without trips, rather than only the
98 active routes or a selected pilot.

The [scoped review contract](gtfs-scoped-review.md#draft-decisions-and-exact-dates)
now supports `unreferenced` for an agency with no route references. The declaration,
its source-record digest and its reason remain in the draft, without an operator
target. Evaluation rechecks every route. Referenced agencies, routes and stops
cannot use this disposition. An exact reviewed approval is still required;
the [holiday gate](gtfs-holiday-mapping-review.md) continues to reject ignored
entities and excluded pattern dates.

The after run uses implementation commit
`cce7a6c689824c22a7f9ed03ec246f18fdcf046b`; the before run uses #456's implementation.
The canonical data identity deliberately stays the same in both. A complete
comparison verifies that **only LTA's decision changes**. Every other entity
and mapping decision, exact date set and all 388 pattern/evidence records are
identical. The effective population remains 2,473,877 trip/date pairs, including
1,646,557 with passing candidate checks and 827,320 unresolved. There is no
new passenger coverage or actual approval.

## Passenger blockers by cause

This table partitions unresolved effective dates by line and the emitted blocker
set. Each date cell in this capture has one blocker category, so the date and
trip/date columns are disjoint. A trip/date pair is one recurring source trip on
one effective service date; these counts are not independent error counts.

| Family | Diagnostic cause | Pattern/date pairs | Trip/date pairs |
| --- | --- | ---: | ---: |
| CCL | No dated revision/code candidate | 5,334 | 131,782 |
| CCL | Multiple dated service candidates | 2,566 | 26,876 |
| CCL | Platform/service or boarding conflict | 5,184 | 172,485 |
| NSL | Platform/service or boarding conflict | 6,290 | 234,272 |
| NSL | No candidate for supplied path | 365 | 365 |
| EWL | Expo's literal platform/service disagreement | 730 | 80,549 |
| SKLRT | Sengkang East's intermediate-platform disagreement | 730 | 180,193 |
| TEL | No candidate for supplied paths | 114 | 798 |
| **Total** | | **21,313** | **827,320** |

The next evidence work follows those shared causes:

- **Conflicting platform labels:** preserve Expo's and Sengkang East's original
  stop rows alongside the independently maintained bindings. The
  [platform evidence](gtfs-platform-allocation-review-2026-10-31.md) supports
  retaining the existing directions. A later source-interpretation correction
  needs an explicit reviewed contract; matching ID suffixes or silently swapping
  labels would hide the disagreement.
- **Platform restrictions and terminal roles:** AMK's complete A/C and B/D
  alternatives include restricted C/D. Keep those
  [reviewed restrictions](gtfs-amk-platform-evidence-2026-10-28.md). Marina South
  Pier's final-arrival service-scope question remains separate; do not grant
  passenger use or waive a restriction merely to clear a cell.
- **CCL dates and service identity:** distinguish revision/code gaps from
  ambiguity and undated current platform scopes. The
  [CCL classification](gtfs-cross-line-mapping-review-2026-10-28.md#ccl-retain-dates-and-distinguish-three-causes)
  identifies the 12 July boundary and representative paths. Choosing the latest
  revision, backdating codes or selecting a service by its platform preference
  would discard the missing evidence.
- **Unusual source paths:** retain the complete ordered occurrences in the
  [five NSL/TEL traces](gtfs-mapping-disagreements.md#unmatched-source-occurrences),
  including repeated visits and omitted intermediate stations. A documented
  operating exception or provider correction is needed; no interpolation,
  dropped occurrence or exclusion is supplied here.

NEL, DTL, BPLRT and PGLRT have no unresolved effective dates in these candidate
checks. Operational source-condition review still covers BPLRT's dated closures,
holiday-eve extras and the Marine Terrace Saturday discrepancy. Passing mapping
checks does not resolve those separate disagreements.

## Reproduce and compare

Use Node 24 with `TZ=UTC`, build packages, and run the
[shared holiday runner](gtfs-holiday-mapping-review.md#generate-and-inspect)
with canonical commit `4b117172c1f9a0f3e529f510d5b28eeecd67fcaa`. Run once with
#456's tooling and once with the implementation commit above, using the same
committed canonical data, verified capture and holiday inputs, and distinct new
output directories. No source or canonical-data edit is part of this fix.

Generated packets remain outside Git at
`/tmp/gtfs-blocker-baseline-holiday-20261105` and
`/tmp/gtfs-blocker-after-holiday-20261105`. Compare every mapping decision by
`kind`, `providerId` and optional `dateSetId`, and compare the date-review
`patterns` arrays and mapping `dateSets` exactly. Only the `agency:LTA`
disposition and reason differ. Its source-record digest stays unchanged.

| Normalized review identity | Before | After |
| --- | --- | --- |
| Holiday date-review draft | `d5f151b432f25b66762e7a188072345745eea81c0b1e5cc217f10fd971d338e7` | `9a01e1c8a1b35d689994ae187de98a31f2e008a2b18bb7c3c7bb6aabb5e19396` |
| Holiday mapping draft | `05c922eaa45eff2ecabb8cbce2c6ba77f5a5278f64cc23450228572b8350c0c0` | `3c8a2163837e493ff7a48273adbbbdb3eecadac0bb222ba9c206bd84998d6d7e` |

The unchanged date-population digest is
`3647f4b9e8b0bad1ec487e1859085dff066a2069c0bc1896b9b6109e5b63b4cf`.
Both evaluations are valid with complete source/date accounting, unresolved
readiness, no exclusions and no approval. Mapping and generation eligibility
remain false. The changed draft digests require a fresh review; the old date
review is not relabelled as current.

Validation: all 818 deterministic tests, package builds/typecheck, lint,
documentation links and package-boundary checks pass. The real-capture
comparison verifies unchanged passenger evidence and the single declaration
change. Tests reject unreferenced claims for a used agency, an out-of-pilot
route with no trips, routes and stops, and retain the explicit approval gate.
