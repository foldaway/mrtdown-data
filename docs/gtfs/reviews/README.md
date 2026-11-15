# GTFS mapping reviews

## Review workflow

- [Reconciliation](reconciliation.md) explains candidate identities and drift.
- [Scoped review](scoped-review.md) explains how reviewed mappings apply to
  particular captures, line families, and service dates.
- [Holiday-aware mapping](holiday-mapping-review.md) explains the policy-aware
  gate. The [nine-family review](shared-holiday-family-review.md) records the
  capture scope and unresolved evidence for an earlier review.
- [Source platform allocations](source-platform-allocation-review.md) explains
  when reviewed GTFS allocations take precedence while retaining canonical
  direction defaults. The [policy inputs](policies/) are bound to specific
  evidence and review scopes.

The policy JSON preserves its original bytes for reproducibility. Where a
`reason` cites an earlier `docs/` path, see the relocated
[November source journey model](mapping-disagreements.md#november-source-journey-model)
or [Paya Lebar platform decision](source-platform-allocation-review.md#paya-lebar-extension--6-november-2026).

## Review history

- [Inventory](mapping-review-inventory.md), [disagreements](mapping-disagreements.md),
  [review blockers](review-blockers.md), and [shared blocker triage](shared-blocker-triage.md)
  record candidate identities and unresolved evidence.
- [NEL mapping review](nel-mapping-review-2026-10-28.md), [NEL holiday date review](nel-holiday-date-review.md),
  and [cross-line mapping review](cross-line-mapping-review-2026-10-28.md) document
  the evidence used to carry decisions across line families.
- [Platform groups](platform-group-review.md), [platform allocation review](platform-allocation-review-2026-10-31.md),
  [Ang Mo Kio evidence](amk-platform-evidence-2026-10-28.md), and [Choa Chu Kang correction](cck-platform-correction-2026-10-31.md)
  record specific platform evidence and decisions.
- [Audit reports and manifests](audits/) preserve the historical schedule
  manifest, independent validator findings, and reconciliation outputs. To
  reproduce an audit, see [local inspection](../operations/local-inspection.md#historical-august-audit)
  and [reconciliation](reconciliation.md).
- [October timing compatibility checks](timing-compatibility-2026-10.md) record
  parser results, service date checks, and artifact digests for one capture.

## Line pilots

Each packet groups the mapping notes, the machine-readable draft, and the
review summary for the pilot capture.

- [Bukit Panjang LRT](pilots/bplrt/mappings.md)
- [Circle Line](pilots/ccl/mappings.md)
- [Downtown Line](pilots/dtl/mappings.md)
- [East West Line](pilots/ewl/mappings.md)
- [North East Line](pilots/nel/mappings.md)
- [North South Line](pilots/nsl/mappings.md)
- [Punggol LRT](pilots/pglrt/mappings.md)
- [Sengkang LRT](pilots/sklrt/mappings.md)
- [Thomson–East Coast Line](pilots/tel/mappings.md)
