# Plans

## When to write a plan

Use an in-session checklist or the PR description for a bounded change with a
clear implementation and verification path. Routine data edits, bug fixes, and
documentation updates usually fit here.

Write a versioned execution plan when work needs ordered milestones across PRs
or repositories, when a migration or publication cutover needs coordinated
validation and recovery, or when discovery and decisions must survive a handoff.
For example, use the existing runbook for a routine timetable refresh and write
a plan when switching the published timetable format across repositories.
Start one when ongoing work grows to meet those conditions. Update the existing
plan when the work already has one. Track standalone follow-ups in a GitHub issue
and broader deferred work in [tech debt](tech-debt.md).

## How to maintain a plan

1. Copy the [template](template.md) into `active/<topic>.md` and link it in the
   active index. Keep the template's level-two headings in order and use
   subheadings for project-specific detail. `npm run check:docs` checks the
   headings in active plans. Follow the [proposal writing guidance](../README.md#writing-docs-and-proposals).
2. Make the next step executable from a fresh checkout. Name the relevant files
   and commands, distinguish verified facts from assumptions, and state the
   expected results. Link to supporting evidence and durable subject guides.
   Summarize any fact or decision from outside the repo that execution depends on.
3. Update the progress checklist when a milestone changes or work stops. Date
   completed items and record remaining steps and blockers. Record discoveries
   with evidence and decisions with their rationale.
4. When the acceptance criteria are met, capture the outcomes and verification
   evidence. Move the plan to `completed/`, update the index and inbound links,
   and put any lasting operating guidance with its subject. Record deferred
   work in the relevant issue or tech debt entry. Completed plans and migration
   reports preserve the format and context of their original work.

The short agent entry point, subject indexes, and living execution plans follow
OpenAI's [Harness Engineering article](https://openai.com/index/harness-engineering/)
and its companion [execution plan guide](https://developers.openai.com/cookbook/articles/codex_exec_plans).

## Active

- [Direct-to-main ingestion reliability](active/direct-main-ingestion.md) covers
  historical replay, semantic guards, canonical issue audits, shadow mode, and
  staged removal of the automated ingestion PR queue.
- [GTFS static and realtime support](active/gtfs-static-realtime.md) covers the
  observed LTA file audit, canonical reconciliation, a scheduled-arrivals
  artifact for `mrtdown-site`, service-alert evidence, and trip-update capture.
- [Data licensing and attribution](active/data-licensing-attribution.md) covers the
  source registry, evidence rights classification, and generated attribution
  artifacts for data publication.
- [Schematic system map generation](active/schematic-system-map.md) covers the canonical
  schematic map generator, rule schema, validation, and publication.
- [Station first and last train data](active/station-first-last-train-data.md)
  covers embedded station timings keyed by full scheduled service patterns.

## Completed

- [GTFS calendar publication](completed/gtfs-calendar-publication.md): automatic
  source exceptions and stopping patterns, exact import recovery and verified deployment.

- [Automatic GTFS publication](completed/gtfs-automatic-publication.md):
  checked routine successors, exception review and verified production activation.
- [GTFS release retention](completed/gtfs-release-retention.md): compact reviewed
  inputs, exact replay and bounded current/previous ready bundles.
- [Crowdsourced reports canonical ingest](completed/crowdsourced-reports.md):
  public report payload contract and canonical evidence ingestion path.
- [Data overhaul split](completed/data-overhaul-split.md): historical split
  sequence for the package/data repository migration.
- [Ingest contracts package](completed/ingest-contracts-package.md): shared
  webhook payload contract for external evidence producers.
- [Issue data migration](completed/issue-data-migration.md): Step 7 issue data
  migration report.
- [Legacy source data removal](completed/legacy-source-data-removal.md): Step
  7.5 source-data removal report.
- [Runtime removal and deploy cleanup](completed/runtime-removal-deploy-cleanup.md):
  Step 8 runtime and deploy cleanup report.

## Tech Debt

- [Tech debt](tech-debt.md): durable follow-up items that are too broad for a
  single issue or PR.
