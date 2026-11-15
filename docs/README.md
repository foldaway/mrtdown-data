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

## Writing docs and proposals

- Write for a busy reader. Lead with what changes, why it matters, and what
  decision or action is needed. Give enough context for a reader to act.
- Use descriptive headings, short paragraphs, and bullets for independent
  points. Use numbered steps when order matters.
- Say each thing once. Link to nearby schemas, tests, CLI help, or existing
  guides for details they already explain. Write down the rationale, policies,
  failure modes, and evidence a reader would otherwise have to reconstruct.
- For a proposal with open choices, state the recommendation, its tradeoff,
  and what evidence would change it. Record the decision in the relevant plan
  or subject guide.
- Update the existing subject guide when behavior changes. Keep dated evidence
  with the review it supports and implementation history with the plan.
