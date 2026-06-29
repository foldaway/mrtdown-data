# @mrtdown/ingest-contracts

## 2.0.0-alpha.30

### Major Changes

- c7ffe21: Add rights source registry schemas, validation, attribution export support, and
  public export evidence redaction.

  Restrict crowd-report ingest source URLs to the `reports.mrtdown.sg` host.

## 2.0.0-alpha.29

### Major Changes

- cd9c01e: Require crowd-report timestamps to include timezone offsets, reject reports
  observed after producer acceptance, and require HTTP(S) source URLs.

## 2.0.0-alpha.28

### Major Changes

- 2e271e4: Require crowd-report payloads to include `reportCount` so single accepted
  reports and accepted report clusters share a consistent contract shape.

## 2.0.0-alpha.27

### Minor Changes

- 926f23a: Add optional enriched news article text fields to the ingest contract and use
  them during triage formatting.

## 2.0.0-alpha.26

### Minor Changes

- 4f1e62a: Export crowd-report source and effect constants from the ingest contracts
  package.

## 2.0.0-alpha.25

### Minor Changes

- 2d31470: Add the crowd-report ingest content contract and map accepted crowd reports to
  public report evidence during triage ingestion.

## 2.0.0-alpha.24

### Minor Changes

- 3cd53b3: Add a published ingest payload contract package and consume it from triage
  webhook ingestion.
