# @mrtdown/cli

## 2.0.0-alpha.43

### Minor Changes

- 9be8340: Export a complete source timetable from a verified local GTFS capture, retaining
  capture provenance, table hashes and a reproducible timetable hash.

### Patch Changes

- Updated dependencies [6f9f2d8]
- Updated dependencies [9be8340]
- Updated dependencies [76e42fb]
- Updated dependencies [666afa7]
- Updated dependencies [9ca6d16]
- Updated dependencies [2cdf063]
- Updated dependencies [76e42fb]
  - @mrtdown/core@2.0.0-alpha.37
  - @mrtdown/fs@2.0.0-alpha.40
  - @mrtdown/triage@2.0.0-alpha.47

## 2.0.0-alpha.42

### Minor Changes

- c40d02c: Choose relevant source service dates automatically for departure queries, including earlier dates for trips running beyond midnight or 48 hours. Keep explicit date selection available and record derived dates in inspection reports without changing snapshot or publication review gates.
- f701e40: Inspect source departures from a verified local schedule capture with the gtfs departures command. Query selected provider trips and service dates in a time window, retaining capture provenance and source timing/access rules without assigning canonical mappings or enabling publication.
- b091eb5: Look up source departures by provider stop ID without supplying trip IDs. Preserve repeated visits and source access rules, reject unknown or non-platform locations and keep publication review gates unchanged.

### Patch Changes

- Updated dependencies [c40d02c]
- Updated dependencies [f701e40]
- Updated dependencies [620eb5d]
- Updated dependencies [b091eb5]
- Updated dependencies [4d2e44c]
- Updated dependencies [bbc0927]
- Updated dependencies [4f6cbb3]
- Updated dependencies [b5c1c1a]
- Updated dependencies [7b725db]
- Updated dependencies [364d0fc]
  - @mrtdown/core@2.0.0-alpha.36
  - @mrtdown/fs@2.0.0-alpha.39
  - @mrtdown/triage@2.0.0-alpha.46

## 2.0.0-alpha.41

### Patch Changes

- Updated dependencies [89d00f8]
- Updated dependencies [1fa24c7]
- Updated dependencies [c3cea87]
  - @mrtdown/fs@2.0.0-alpha.38
  - @mrtdown/core@2.0.0-alpha.35
  - @mrtdown/triage@2.0.0-alpha.45

## 2.0.0-alpha.40

### Patch Changes

- Updated dependencies [c4bfeb0]
- Updated dependencies [4e48047]
  - @mrtdown/fs@2.0.0-alpha.37
  - @mrtdown/triage@2.0.0-alpha.44

## 2.0.0-alpha.39

### Patch Changes

- Updated dependencies [d034d6b]
  - @mrtdown/fs@2.0.0-alpha.36
  - @mrtdown/triage@2.0.0-alpha.43

## 2.0.0-alpha.38

### Patch Changes

- Updated dependencies [9d75a31]
- Updated dependencies [9d75a31]
  - @mrtdown/fs@2.0.0-alpha.35
  - @mrtdown/triage@2.0.0-alpha.42

## 2.0.0-alpha.37

### Patch Changes

- Updated dependencies [1830b9a]
  - @mrtdown/core@2.0.0-alpha.34
  - @mrtdown/fs@2.0.0-alpha.34
  - @mrtdown/triage@2.0.0-alpha.41

## 2.0.0-alpha.36

### Patch Changes

- Updated dependencies [5cfae07]
  - @mrtdown/core@2.0.0-alpha.33
  - @mrtdown/fs@2.0.0-alpha.33
  - @mrtdown/triage@2.0.0-alpha.40

## 2.0.0-alpha.35

### Patch Changes

- Updated dependencies [18a6dca]
  - @mrtdown/core@2.0.0-alpha.32
  - @mrtdown/fs@2.0.0-alpha.32
  - @mrtdown/triage@2.0.0-alpha.39

## 2.0.0-alpha.34

### Patch Changes

- Updated dependencies [6906afc]
- Updated dependencies [e9f6d69]
- Updated dependencies [31f80c7]
  - @mrtdown/core@2.0.0-alpha.31
  - @mrtdown/fs@2.0.0-alpha.31
  - @mrtdown/triage@2.0.0-alpha.38

## 2.0.0-alpha.33

### Patch Changes

- Updated dependencies [d497288]
  - @mrtdown/core@2.0.0-alpha.30
  - @mrtdown/fs@2.0.0-alpha.30
  - @mrtdown/triage@2.0.0-alpha.37

## 2.0.0-alpha.32

### Patch Changes

- Updated dependencies [949f110]
  - @mrtdown/core@2.0.0-alpha.29
  - @mrtdown/fs@2.0.0-alpha.29
  - @mrtdown/triage@2.0.0-alpha.36

## 2.0.0-alpha.31

### Patch Changes

- @mrtdown/triage@2.0.0-alpha.35

## 2.0.0-alpha.30

### Patch Changes

- Updated dependencies [556bd8a]
  - @mrtdown/core@2.0.0-alpha.28
  - @mrtdown/fs@2.0.0-alpha.28
  - @mrtdown/triage@2.0.0-alpha.34

## 2.0.0-alpha.29

### Patch Changes

- c7ffe21: Add rights source registry schemas, validation, attribution export support, and
  public export evidence redaction.

  Restrict crowd-report ingest source URLs to the `reports.mrtdown.sg` host.

- Updated dependencies [c7ffe21]
  - @mrtdown/core@2.0.0-alpha.27
  - @mrtdown/fs@2.0.0-alpha.27
  - @mrtdown/triage@2.0.0-alpha.33

## 2.0.0-alpha.28

### Patch Changes

- @mrtdown/triage@2.0.0-alpha.32

## 2.0.0-alpha.27

### Patch Changes

- @mrtdown/triage@2.0.0-alpha.31

## 2.0.0-alpha.26

### Patch Changes

- Updated dependencies [42acc62]
  - @mrtdown/core@2.0.0-alpha.26
  - @mrtdown/fs@2.0.0-alpha.26
  - @mrtdown/triage@2.0.0-alpha.30

## 2.0.0-alpha.25

### Patch Changes

- Updated dependencies [a4475de]
  - @mrtdown/core@2.0.0-alpha.25
  - @mrtdown/fs@2.0.0-alpha.25
  - @mrtdown/triage@2.0.0-alpha.29

## 2.0.0-alpha.24

### Patch Changes

- 5b24d47: Add generated fixture support across package tests, support Hong Kong period time
  zones, update Pages index generation, and tighten triage claim normalization.
- Updated dependencies [5b24d47]
  - @mrtdown/core@2.0.0-alpha.24
  - @mrtdown/fs@2.0.0-alpha.24

## 2.0.0-alpha.23

### Patch Changes

- Updated dependencies [ebdf12e]
  - @mrtdown/core@2.0.0-alpha.23
  - @mrtdown/fs@2.0.0-alpha.23
