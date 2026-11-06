# Review source platform-label interpretations

Some feed labels disagree with station signs and the maintained platform
directions. This review compares an explicit interpretation with the original
feed, so the disagreement stays visible. It does not edit the capture or
canonical data, create approval, or enable timetable generation.

## Proposed interpretation and evidence

The [platform policy](gtfs-platform-label-policy-2026-11-02.json) proposes twelve
single-label changes for the pinned capture:

| Source stops | Original → interpreted label | Canonical station |
| --- | --- | --- |
| `CG1_A`, `CG1_B` | B → A, A → B | Expo |
| `SE1_A` … `SE5_A` | 1 → 2 | Compassvale, Rumbia, Bakau, Kangkar, Ranggung |
| `SE1_B` … `SE5_B` | 2 → 1 | The same five stations |

The [station evidence review](gtfs-platform-allocation-review-2026-10-31.md)
supports retaining Expo's A/east and B/west directions, and Sengkang East's
1/clockwise and 2/counterclockwise bindings. Eight Sengkang bindings retain their
recorded same-line inference. The supplied Bakau and Rumbia image dates remain
unknown; those boards do not independently verify the other three stations or
every date. Stop-ID suffixes are not evidence for the changes.

This is a **proposed Foldaway interpretation**, not an approved source correction
or operator confirmation. Applying it across 2026 exposes the exceptions below.

## Comparison on the 2 November capture

Both runs use canonical commit `987147261a35eb771bcae223f50cdbf6174a1899`
after [PR #457](https://github.com/foldaway/mrtdown-data/pull/457), canonical
[SG-2026](../data/public-holiday/SG-2026.json), and the
[capture-specific holiday policy](gtfs-shared-holiday-policy-2026-11-02.json).
The verified [receipt](https://sources.mrtdown.org/captures/schedule/ceb07f9c91de86559212eb48c1feac6455452900fad49cf009414a66c2f17efe.json)
records retrieval at `2026-11-02T20:00:07.575Z`; its
[original ZIP](https://sources.mrtdown.org/blobs/schedule/ceb07f9c91de86559212eb48c1feac6455452900fad49cf009414a66c2f17efe.zip)
is 2,996,770 bytes, SHA-256
`ceb07f9c91de86559212eb48c1feac6455452900fad49cf009414a66c2f17efe`.
LTA attribution and licence are in the [public handoff](gtfs-public-handoff.md).
The receipt has no provider timestamp; discovery does not establish source-order
admission or approval.

Compared with the October packet, stop rows and calendars are identical, while
routes, trips and stop times changed. There are now 103 active routes, 19,140
recurring trips and 392 patterns. The new holiday policy explicitly lists those
active routes; the older policy and reports remain historical. No approval
transfers between captures.

The effective population is **2,478,348 trip/date pairs** in both runs.
An unresolved pair means one recurring trip on one effective service date;
passing pairs are mapping proposals, not published departures.

| Unresolved trip/date pairs | Original labels | Proposed interpretation |
| --- | ---: | ---: |
| Expo airport branch | 80,549 | 365 |
| Sengkang East | 180,193 | 0 |
| CCL | 338,807 | 338,807 |
| NSL | 234,637 | 234,637 |
| TEL | 798 | 798 |
| **Total** | **834,984** | **574,607** |

NEL, DTL, BPLRT and PGLRT have no unresolved mapping dates in either run.
Twelve pattern cells gain passing candidates, but three first-morning airport
cells lose theirs: unresolved decisions move **184 → 175**, and unresolved
pattern/date pairs **21,815 → 20,720**. The net gain is 260,377 trip/date pairs.

**Expo is not fully resolved.** These three first Tanah Merah-bound trips
pass under the original labels and conflict after the proposed swap:

- `EWL_CGL_WB_WD_102_3066`: 251 effective dates.
- `EWL_CGL_WB_WE_102_4513`: 51 effective dates.
- `EWL_CGL_WB_PH_102_4556`: 63 effective dates.

Each runs the full `Changi Airport → Expo → Tanah Merah` route; these are not
short workings. The weekday and Saturday variants call at Expo at 05:36
(departure 05:36:59), and the Sunday/public-holiday variant at 06:04
(departure 06:04:58). Each is the earliest westbound Expo departure in its
source day-type timetable. They use `CG1_A`, the same Expo stop used by ordinary
Changi Airport-bound trips, while subsequent westbound trips use `CG1_B`.
This might describe a special early-morning platform allocation or an incorrect
stop reference. The feed alone cannot distinguish those explanations.

All 365 occurrences stay unresolved. This is evidence against treating a
blanket swap as a complete fix; it does not justify an undocumented trip-specific
override. Sengkang East passes this interpretation's mapping checks, with its
evidence limits intact. CCL dates, AMK restrictions, terminal roles, unusual
paths and operational source conditions remain separate work.

The comparison verifies identical pattern IDs, trip membership, stop order,
original/effective dates and source pattern hashes throughout. Other families'
complete pattern reviews are identical. Only the twelve `platform_code` values
are interpreted; raw tables, source IDs, parents, times and canonical bindings
stay unchanged. Both evaluations are valid with complete accounting, unresolved
readiness, no approval and `generationEligible: false`.

## Review contract

`createScheduledPlatformLabelMappingDraft` accepts the original verified context,
platform policy, holiday policy and holiday calendar. It requires an exact
manifest match, one source platform row with the expected literal label, a
well-formed parent and a unique canonical station/line/platform target. Duplicate
rules, no-op rules and slash-delimited platform groups are rejected. AMK's
complete A/C and B/D alternatives cannot be narrowed through this mechanism.

The distinct `gtfs-platform-label-mapping-draft` contains the original identity,
both policy digests, changed-row digests and target platforms, the derived
manifest, date review and editable holiday mapping. The derived stop-table hash
covers a UTF-8 CSV with source column and row order, standard quote escaping and
LF line endings including the final newline. It is explicitly separate from the
original table hash. All other table hashes remain original.

`evaluateScheduledPlatformLabelMapping` reconstructs the interpretation and
reuses the existing [holiday mapping checks](gtfs-holiday-mapping-review.md).
It verifies change evidence, dates, temporal candidates, complete platform
alternatives, service scopes and boarding restrictions. The distinct
`gtfs-platform-label-mapping-approval` must bind the original and derived
identities, policy digests and exact wrapper digest, plus reviewer and reason.
Approval is repository-review metadata, not authentication; it cannot clear an
unresolved trip. No approval record is generated. Literal and holiday approval
formats cannot approve this wrapper, and the literal assignment and release
consumers do not accept it. Generation remains false even for a synthetic fully
resolved, approved review.

## Reproduce

Acquire the exact public receipt and ZIP above, then use Node 24 with `TZ=UTC`
after `npm run build:fs`:

```sh
node scripts/draft-gtfs-scoped-review.mjs \
  /tmp/gtfs-current-capture-20261105/schedule.zip \
  /tmp/gtfs-current-capture-20261105/capture.json \
  NSL,EWL,NEL,CCL,DTL,TEL,BPLRT,SKLRT,PGLRT \
  /tmp/new-platform-label-review \
  --canonical-commit 987147261a35eb771bcae223f50cdbf6174a1899 \
  --holiday-policy docs/gtfs-shared-holiday-policy-2026-11-02.json \
  --holiday-calendar SG-2026 \
  --platform-label-policy docs/gtfs-platform-label-policy-2026-11-02.json
```

The runner writes `platform-label-review.json`, `platform-label-evaluation.json`
and `summary.json` into a new directory. Large generated packets stay outside
Git. For the baseline, omit `--platform-label-policy` and choose another new
directory. To inspect reviewed edits, supply `--platform-label-review <json>`;
actual review metadata uses `--platform-label-approval <json>`. These options
cannot mix with literal assignment options or holiday-only review/approval files.
Every run verifies the original capture and committed canonical data first.

The original holiday mapping digest is
`b9c187430436afe511f8a30d9afb270f39d547d4ad4f6f821885cc56da98d946`;
the interpreted wrapper digest is
`79f773623364b0891455eb9fb658dbbcf61c4aadff7ff52b1465db840594f6a8`.
These identify this diagnostic run. Regenerate after canonical or policy changes.
