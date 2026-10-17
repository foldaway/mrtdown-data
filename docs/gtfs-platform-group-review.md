# Grouped-platform mapping review

Version 3 can propose a complete set of physical platform alternatives for one
source stop. It preserves literal grouped labels without selecting an individual
platform. Version 2 remains available with unchanged output and digests; the
[all-line inventory](gtfs-mapping-review-inventory.md) is its baseline. Neither
version approves mappings or enables arrivals generation.

## Contract

`createGroupedScopedReconciliationDraft`,
`evaluateGroupedScopedReconciliation` and
`GroupedScopedReconciliationDraftSchema` use schema version 3. Existing entity
and exact-date pattern decisions keep the [scoped review rules](gtfs-scoped-review.md).
Only a stop decision can use the new target:

```json
{
  "kind": "platformGroup",
  "stationId": "CGA",
  "lineId": "EWL",
  "platformIds": ["CGA_EWL_A", "CGA_EWL_B"]
}
```

A group has no synthetic physical-platform ID. Every distinct nonempty literal
label must identify exactly one existing canonical member at the same station
and line, using the source stop code and consistent parent identity. A missing
member, duplicate label, ambiguous canonical label, conflicting parent or
cross-line substitution leaves the stop unresolved. The evaluator rebuilds the
entire group from the verified context; a forged group or a subset fails.
Member order is immaterial; duplicates are invalid.

Matched pattern cells must pass the existing exact calendar, revision,
station-code and operator-period checks. In addition, **every represented member
at every occurrence** must pass current service and boarding diagnostics. One
usable member cannot hide an excluded or inactive alternative. Alighting-only
members remain incompatible with intermediate occurrences that permit pickup;
final occurrences retain the existing terminal rule. These undated diagnostics
do not establish historical allocation, source semantics or calendar correctness.
No source endpoint, repeated occurrence or short working is changed.

`groupedScopedReviewDraftSha256` binds the version-3 draft, including every member
and exact proposal text. `GroupedScopedReconciliationApprovalSchema` requires
version 3 and that digest plus the exact input identity. A version-2 approval
cannot approve this artifact. Review metadata remains a repository assertion;
the tool never creates an approval. Even a complete, valid, digest-bound review
still returns `generationEligible: false`.

## October snapshot proposals

The input is schedule SHA-256
`e459a22be6c99a3728ee97770c02c4edbaee6c9293e48017e8ec28139962fa19`,
canonical commit `d034d6babef4ea5bcac256d26c47dcd802bb39ba`, topology projection 1
SHA-256 `e376c280fbd6292ed6fe03e7fa81541ad0b0b8c76a09f916f1e3898aac240ec1`.
The seven complete grouped records are:

| Source stop IDs | Station / line | Literal labels | Complete canonical alternatives |
| --- | --- | --- | --- |
| `NS1_A`, `NS1_B` | Jurong East / NSL | A / D / E | `JUR_NSL_A`, `JUR_NSL_D`, `JUR_NSL_E` |
| `EW24_A` | Jurong East / EWL | B / C | `JUR_EWL_B`, `JUR_EWL_C` |
| `CG_A`, `CG_B` | Tanah Merah / EWL | D / E | `TNM_EWL_D`, `TNM_EWL_E` |
| `CG2_A`, `CG2_B` | Changi Airport / EWL | A / B | `CGA_EWL_A`, `CGA_EWL_B` |

The additional matched patterns all retain their entire supplied active calendars:

| Service | Additional patterns | Recurring trip records | Pattern-date pairs |
| --- | ---: | ---: | ---: |
| `NSL_MAIN_N` / `NSL_MAIN_S`, Jurong East–Yew Tee short workings | 6 | 7 | 730 |
| `EWL_MAIN_E`, Joo Koon / Tuas Link eastbound patterns | 18 | 758 | 2,190 |
| `EWL_CG_W`, Changi Airport–Tanah Merah short workings | 3 | 3 | 365 |
| **Total** | **27** | **768** | **3,285** |

The cumulative full draft still has 1,155 cells with complete accounting:
964 matched proposals and 191 unresolved cells. Matched proposals comprise two
agencies, 113 routes, 186 station parents, 425 individually identified platform
stops, seven grouped stops and 231 pattern/date cells. The groups are counted
separately from individual platform allocations. The unresolved cells comprise
unused agency `LTA`, `NS16_A` / `NS16_B`, and 188 pattern/date cells.

Of 388 patterns, 200 now have proposed matches on every active date, 31 retain
partial CCL matches, and 157 have no matched date. Matched pattern-date pairs rise
from 22,983 to 26,268; 22,123 remain unresolved. The 231 patterns with some matched
coverage contain 12,106 recurring trip records, including the 1,098 CCL records
whose earlier dates remain unresolved. These counts do not count individual
dated departures or establish whole-line acceptance.

The full draft is valid with readiness `unresolved`. Its matched-only subset has
964 decisions but omits 160 entries and 22,123 pattern dates, so remains
`incomplete`. Both have no approval, ignore, exclusion or inactive decision and
keep mapping-review and generation eligibility false.

Ang Mo Kio remains incomplete: `NS16_A` names A / C and `NS16_B` names B / D,
while the canonical layout contains only A and B. The tool does not drop C/D or
invent members. Six airport patterns retain the Expo label/service conflicts;
three other westbound airport patterns now pass because their Expo member
already supports that service. CCL dates, Sengkang East, Choa Chu Kang,
Marina South Pier, five source-path disagreements and the unused agency retain
the [inventory's evidence requirements](gtfs-mapping-review-inventory.md#remaining-decisions).

The optional [blocker report](gtfs-review-blockers.md) locates exact unresolved
date cells, missing group members and conflicting occurrences. Add `--blockers`
to the command below to produce it alongside the existing outputs.

## Reproduce

After materializing the [verified source and receipt](gtfs-public-handoff.md),
run in a fresh output directory:

```sh
npm run build:fs
node scripts/draft-gtfs-scoped-review.mjs \
  /absolute/path/schedule.zip /absolute/path/capture.json \
  NSL,EWL,NEL,CCL,DTL,TEL,BPLRT,SKLRT,PGLRT \
  /tmp/new-grouped-platform-review \
  --canonical-commit d034d6babef4ea5bcac256d26c47dcd802bb39ba \
  --platform-groups
```

The normalized full-draft digest is
`3811b7debc2cfe9895b218bd4ca6f04bb836b4c945edcf976d9213672caf2059`;
the focused-draft digest is
`66274468cce6af95553fd5a2cb8affb5992f961a9cdad88e938717847585c818`.
All five output files reproduce byte for byte with reordered/repeated line IDs.
Omitting `--platform-groups` reproduces the existing version-2 files byte for
byte. Large generated drafts stay outside Git; the summary includes exact
pattern/source identities, calendars, date sets and file digests for review.
Phase 2 remains open, including source/calendar correctness, reviewed lineage,
human mapping review and publication prerequisites.
