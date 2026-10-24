# @mrtdown/core

## 2.0.0-alpha.39

### Minor Changes

- cbb1480: Preview a compact timetable with shared canonical patterns, date-range assignments
  and explicit coverage gaps while preserving all source timing and calendars.
- 46a4992: Add reviewed timetable source admission checks so later downloads, opaque provider versions and unreviewed corrections cannot automatically replace an installed timetable.
- e2281e6: Prepare and verify scheduled timetable files with a shared provenance manifest,
  source attribution notice and exact file hashes.
- a073567: Describe reviewed timetable files in the Pages manifest and show source
  attribution, licence and coverage beside the download links.

## 2.0.0-alpha.38

### Minor Changes

- f4ea68c: Add optional boarding-only departure queries that require pickup permission and a
  later permitted alighting stop, while preserving raw source inspection by default.

## 2.0.0-alpha.37

### Minor Changes

- 6f9f2d8: Resolve source-trip pattern bindings on explicit service dates, rejecting active
  mapping gaps and overlapping or invalid scopes while retaining canonical
  identities and source timing.
- 666afa7: Add canonical scheduled-trip pattern references and a topology checker that
  validates station, line, service, revision and every platform alternative.
- 9ca6d16: Query departure windows with date-scoped canonical trip patterns, retaining source
  occurrence identities and platform alternatives while rejecting mapping gaps or
  conflicts before filtering.
- 2cdf063: Bind canonical trip patterns to exact source occurrences while preserving source
  timing, access restrictions and platform alternatives.

### Patch Changes

- 76e42fb: Require real ISO civil dates for service revision boundaries so canonical data
  validation agrees with scheduled-trip date checks.

## 2.0.0-alpha.36

### Minor Changes

- c40d02c: Choose relevant source service dates automatically for departure queries, including earlier dates for trips running beyond midnight or 48 hours. Keep explicit date selection available and record derived dates in inspection reports without changing snapshot or publication review gates.
- 4d2e44c: Add a compact source timetable contract and GTFS assembler that validate trips
  and calendars together, preserving all definitions and rejecting duplicate or
  missing identities.
- bbc0927: Query source departures across explicitly selected service dates with an inclusive start and exclusive end. Preserve after-midnight offsets, repeated occurrences, access rules and precision; reject duplicate trip/date selections and sort coincident departures deterministically without changing snapshot selection or publication gates.
- 4f6cbb3: Add compact scheduled-service calendars, a civil-date availability lookup and a GTFS calendar parser preserving inclusive weekly bounds and explicit date additions/removals. Reject duplicate or invalid source rules without changing reconciliation behavior or generation gates.
- b5c1c1a: Add Singapore service-day instant conversion that preserves elapsed offsets beyond midnight using the GTFS time base. Share the stop-time offset validator while keeping calendar selection, source precision and generation gates separate.
- 7b725db: Resolve validated source-trip timing on a matching calendar's enabled service date. Retain service-date and occurrence identity, access rules, precision and offsets while adding UTC instants; keep missing approximate times null and reject mismatched calendars without changing generation or publication gates.
- 364d0fc: Add ordered source-trip timing validation and batch GTFS assembly. Preserve exact occurrence identities, repeated stops and missing approximate times while rejecting duplicate sequences, missing boundary times and chronology regressions. Keep mapping approval and generation gates unchanged.

## 2.0.0-alpha.35

### Minor Changes

- 1fa24c7: Add a shared scheduled-stop-time contract and fixed-stop GTFS parser that preserve service-day offsets beyond midnight, textual occurrence identity, pickup/drop-off restrictions and timepoint precision without generating arrivals.

## 2.0.0-alpha.34

### Minor Changes

- 1830b9a: Allow next-station arrival estimates to use fresh, scoped commuter reports,
  including confidence and conflicting-report metadata.

## 2.0.0-alpha.33

### Minor Changes

- 5cfae07: Add three frequency-based next-station arrival estimates based on published
  representative headways and sourced first and last train anchors.

## 2.0.0-alpha.32

### Major Changes

- 18a6dca: Add required line-level platform door counts and train-car formations, with
  explicit `null` door counts for LRT lines that have no platform doors or gates.

## 2.0.0-alpha.31

### Major Changes

- 6906afc: Rename station layout `sourceId` to `exitSourceId` so the LTA licence boundary
  applies explicitly to exit data.
- e9f6d69: Add a narrow platform schema for independently observed facts with a canonical
  review date and validation against station lines and active service revisions.

### Minor Changes

- 31f80c7: Allow station platform records to identify directly observed same-line
  platforms as inference bases, and validate those references and service
  assignments across canonical station data.

## 2.0.0-alpha.30

### Major Changes

- d497288: Require provenance dates on durable station layout records, add temporary exit
  closure and non-boardable platform statuses, disambiguate repeated service
  stops, validate platform mappings against service revisions active on each
  platform's provenance date, and keep transfer endpoints as lightweight
  references.

## 2.0.0-alpha.29

### Patch Changes

- 949f110: Add source-backed service frequency profiles, station-level frequency windows, and enumerated estimated departures.

## 2.0.0-alpha.28

### Major Changes

- 556bd8a: Require station code period boundaries to use date-only values and interpret
  them in the Singapore time zone during validation.

  Make station service-reference validation deterministic by checking all service
  revisions instead of selecting revisions based on the current time.

## 2.0.0-alpha.27

### Patch Changes

- c7ffe21: Add rights source registry schemas, validation, attribution export support, and
  public export evidence redaction.

  Restrict crowd-report ingest source URLs to the `reports.mrtdown.sg` host.

## 2.0.0-alpha.26

### Patch Changes

- 42acc62: Add station discovery metadata schemas and validate duplicate aliases.

## 2.0.0-alpha.25

### Patch Changes

- a4475de: Add station first/last train schemas and validate timing service references.

## 2.0.0-alpha.24

### Patch Changes

- 5b24d47: Add generated fixture support across package tests, support Hong Kong period time
  zones, update Pages index generation, and tighten triage claim normalization.

## 2.0.0-alpha.23

### Patch Changes

- ebdf12e: Add npm package publishing metadata and release tooling.

## 2.0.0-alpha.22

### Patch Changes

- 4bcf7cb: introduce StationStructureTypeSchema

## 2.0.0-alpha.21

### Patch Changes

- 7ebfa36: standardize evidence/facility effect enums

## 2.0.0-alpha.20

### Patch Changes

- 7e52957: rebased release
