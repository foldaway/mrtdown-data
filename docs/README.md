# Documentation

- [GTFS](gtfs/README.md) covers capture, mapping review, timetable publication,
  and consumer contracts.
- [Station layouts](data/station-layout.md) and [public holidays](data/public-holidays.md)
  describe canonical data, source policy, and import commands.
- [Schematic map reference inventory](schematic-map/reference-inventory.md) and
  [designer submissions](schematic-map/designer-submissions.md) cover map
  generation inputs and review.
- [Execution plans](plans/README.md) explains when to write a plan and lists
  active work, completed work, and technical debt.
- [Data license and attribution](../LICENSE-DATA.md) covers canonical and
  third-party material. The [source registry](../data/rights/source-registry.json)
  contains the machine-readable rules for recurring sources.

Start with the [repository README](../README.md) for setup, commands, and
package boundaries. The [triage guide](../packages/triage/README.md) and
[ingest contracts](../packages/ingest-contracts/README.md) live with their packages.

Put new material with its subject and link it from the nearest index. Update the
existing guide when behavior changes. Retain dated evidence with the capture or
review it supports. Keep implementation history in the plan and put operating
instructions in the subject guide so they stay easy to find after the plan closes.
