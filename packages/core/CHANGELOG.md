# @mrtdown/core

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
