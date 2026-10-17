# @mrtdown/fs

## 2.0.0-alpha.38

### Minor Changes

- 89d00f8: Add an opt-in version-3 GTFS mapping review contract that preserves complete physical platform alternatives and checks every member's service and boarding compatibility. Keep version-2 review behavior and digests available unchanged.
- c3cea87: Explain unresolved GTFS mapping cells with a deterministic blocker report containing exact date scopes, unmatched dependencies, literal platform-member evidence and ordered stop occurrences. Preserve existing mapping and approval behavior.

## 2.0.0-alpha.37

### Minor Changes

- c4bfeb0: Add deterministic service-date candidate partitions and version-2 reconciliation
  evidence that preserves uncovered and ambiguous dates across revision boundaries.
  Keep current platform diagnostics separate from temporal coverage and review approval.
- 4e48047: Add a separate version-2 scoped mapping draft, deterministic proposal creator and
  review evaluator with exact shared date sets, complete coverage checks and explicit
  unresolved/excluded scope. Drafts cannot approve mappings or enable generation.

## 2.0.0-alpha.36

### Minor Changes

- d034d6b: Add GTFS reconciliation evidence for calendar, revision and platform scope, bounded
  cyclic path proposals, and normalized snapshot drift comparisons. Proposals remain
  unreviewed and cannot enable arrivals generation.

## 2.0.0-alpha.35

### Minor Changes

- 9d75a31: Add offline GTFS capture verification and inspection, plus a versioned canonical schedule-topology fingerprint for future reviewed reconciliation.

### Patch Changes

- 9d75a31: Accept explicitly attributed public GTFS capture records alongside original private records.

## 2.0.0-alpha.34

### Patch Changes

- Updated dependencies [1830b9a]
  - @mrtdown/core@2.0.0-alpha.34

## 2.0.0-alpha.33

### Patch Changes

- Updated dependencies [5cfae07]
  - @mrtdown/core@2.0.0-alpha.33

## 2.0.0-alpha.32

### Patch Changes

- 18a6dca: Add required line-level platform door counts and train-car formations, with
  explicit `null` door counts for LRT lines that have no platform doors or gates.
- Updated dependencies [18a6dca]
  - @mrtdown/core@2.0.0-alpha.32

## 2.0.0-alpha.31

### Patch Changes

- e9f6d69: Add a narrow platform schema for independently observed facts with a canonical
  review date and validation against station lines and active service revisions.
- 31f80c7: Allow station platform records to identify directly observed same-line
  platforms as inference bases, and validate those references and service
  assignments across canonical station data.
- Updated dependencies [6906afc]
- Updated dependencies [e9f6d69]
- Updated dependencies [31f80c7]
  - @mrtdown/core@2.0.0-alpha.31

## 2.0.0-alpha.30

### Patch Changes

- d497288: Require provenance dates on durable station layout records, add temporary exit
  closure and non-boardable platform statuses, disambiguate repeated service
  stops, validate platform mappings against service revisions active on each
  platform's provenance date, and keep transfer endpoints as lightweight
  references.
- Updated dependencies [d497288]
  - @mrtdown/core@2.0.0-alpha.30

## 2.0.0-alpha.29

### Patch Changes

- Updated dependencies [949f110]
  - @mrtdown/core@2.0.0-alpha.29

## 2.0.0-alpha.28

### Patch Changes

- 556bd8a: Require station code period boundaries to use date-only values and interpret
  them in the Singapore time zone during validation.

  Make station service-reference validation deterministic by checking all service
  revisions instead of selecting revisions based on the current time.

- Updated dependencies [556bd8a]
  - @mrtdown/core@2.0.0-alpha.28

## 2.0.0-alpha.27

### Patch Changes

- c7ffe21: Add rights source registry schemas, validation, attribution export support, and
  public export evidence redaction.

  Restrict crowd-report ingest source URLs to the `reports.mrtdown.sg` host.

- Updated dependencies [c7ffe21]
  - @mrtdown/core@2.0.0-alpha.27

## 2.0.0-alpha.26

### Patch Changes

- 42acc62: Add station discovery metadata schemas and validate duplicate aliases.
- Updated dependencies [42acc62]
  - @mrtdown/core@2.0.0-alpha.26

## 2.0.0-alpha.25

### Patch Changes

- a4475de: Add station first/last train schemas and validate timing service references.
- Updated dependencies [a4475de]
  - @mrtdown/core@2.0.0-alpha.25

## 2.0.0-alpha.24

### Patch Changes

- 5b24d47: Add generated fixture support across package tests, support Hong Kong period time
  zones, update Pages index generation, and tighten triage claim normalization.
- Updated dependencies [5b24d47]
  - @mrtdown/core@2.0.0-alpha.24

## 2.0.0-alpha.23

### Patch Changes

- ebdf12e: Add npm package publishing metadata and release tooling.
- Updated dependencies [ebdf12e]
  - @mrtdown/core@2.0.0-alpha.23
