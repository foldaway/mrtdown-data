MRTDown Data License

Unless a file or generated notice says otherwise, MRTDown-authored canonical
data and generated data exports in this repository are licensed under the
Creative Commons Attribution 4.0 International License (`CC-BY-4.0`):

https://creativecommons.org/licenses/by/4.0/

This covers MRTDown-authored static rail entities, issue metadata, normalized
claims, impact events, generated fixture records, and generated export
metadata.

## Third-Party Material

Evidence records may include third-party source text, posts, article metadata,
government or agency source material, user-submitted report text, trademarks,
screenshots, or links to upstream publications. MRTDown does not license those
third-party materials under `CC-BY-4.0`.

Consumers must follow the upstream rights and terms for third-party material.
The source registry in `data/rights/source-registry.json` classifies recurring
source types and records the attribution policy used by generated artifacts.

## Singapore Open Data

Where data is mirrored or derived from Singapore government open data sources,
upstream Singapore Open Data Licence notices continue to apply to the upstream
material. MRTDown licenses only its own curation, normalization, and derived
metadata under `CC-BY-4.0`.

### LTA MRT Station Exit

Station `layout.exits` records contain information from the Land Transport
Authority's [LTA MRT Station Exit (GEOJSON) dataset](https://data.gov.sg/datasets/d_b39d3a0871985372d7e1637193335da5/view),
accessed on 19 July 2026 from data.gov.sg. The upstream material is made
available under the [Singapore Open Data Licence v1.0](https://data.gov.sg/open-data-licence).

The upstream exit features remain subject to that licence. MRTDown's
`CC-BY-4.0` licence applies only to MRTDown-authored selection, normalization,
arrangement, and metadata; MRTDown claims no exclusive rights in the underlying
facts. No operator-site station-layout material is included in these records.

## Observed and Inferred Platform Facts

Station `layout.platforms` records, when present, contain factual platform
information independently contributed from personal observation, personal
recollection, or by recorded same-line inference rooted in directly observed
canonical platforms. MRTDown-authored selection, normalization, arrangement,
and metadata are licensed under `CC-BY-4.0`; MRTDown claims no exclusive rights
in the underlying facts.

Personal observation or recollection is the repository's default source policy
for platform records and is not repeated as per-record metadata. The
`inference` field records canonical basis platforms when that default does not
apply. The `lastUpdated` field records the latest canonical review date, while
Git history preserves contribution and review context.

Photographs, Google Maps, Google Street View, Google-hosted user photos,
proprietary operator maps, and website material are not permitted canonical
platform-data sources. The complete source policy is documented in
`docs/plans/active/station-layout-data.md`.

## Source Code

This data license does not apply to package source code, scripts, or tooling.
Package source code, scripts, tooling, and associated documentation are
licensed separately under the MIT License as described in `LICENSE-CODE.md`.
