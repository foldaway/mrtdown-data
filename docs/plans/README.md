# Plans

## When to write a plan

Use an in-session checklist or the PR description for a bounded change with a
clear implementation and verification path. Routine data edits, bug fixes, and
documentation updates usually fit here. See the
[documentation guidance](../development/writing.md) for when a lasting guide or
review record is needed.

Write a versioned execution plan when work needs ordered milestones across PRs
or repositories, when a migration or publication cutover needs coordinated
validation and recovery, or when discovery and decisions must survive a handoff.
For example, use the existing runbook for a routine timetable refresh and write
a plan when switching the published timetable format across repositories.
Start one when ongoing work grows to meet those conditions. Update the existing
plan when the work already has one. Track standalone follow-ups in a GitHub issue
and broader deferred work in [tech debt](tech-debt.md).

## Standard layout

Use the [template](template.md) for every new or active execution plan. Keep its
level-two headings in this order; add task-specific level-three headings inside
them. `npm run check:docs` enforces heading presence and order against the template.

| Section | What belongs here |
| --- | --- |
| Purpose | The outcome, why it matters, and scope. |
| Progress | Dated completed steps, remaining work, and blockers. |
| Surprises & Discoveries | Observations that changed the work, with evidence. |
| Decision Log | Decisions, rationale, date, and decision maker when known. |
| Outcomes & Retrospective | What is verified, what remains, and lessons learned. |
| Context and Orientation | Current behavior, owning paths, assumptions, and terms. |
| Plan of Work | Ordered milestones and the result each should deliver. |
| Concrete Steps | Exact commands, prerequisites, working directory, and expected results. |
| Validation and Acceptance | Observable scenarios and the proof required to finish. |
| Idempotence and Recovery | Repeat, partial-failure, cleanup, and rollback behavior. |
| Artifacts and Notes | Obtained evidence and exact identities; outstanding evidence is labeled. |
| Interfaces and Dependencies | Contracts, external services, compatibility, and unresolved boundaries. |

Keep every section, even when a sentence explains that nothing is recorded or
applicable yet. Write prose by default and use checkboxes for Progress. Put each
command, contract, and evidence record in one section and refer to it from the
others. The template is the maintained layout; do not create a parallel format.
Historical completed plans retain the format in which they were executed.

## How to maintain a plan

1. Copy the [template](template.md) into `active/<topic>.md` and link it below.
   Follow the standard layout above and the [writing guidance](../development/writing.md).
2. Make it resumable from the repo alone. Include the goal, current behavior,
   owning paths, essential assumptions and outside decisions, exact commands,
   expected results, and recovery for risky steps. Link to checked-in contracts
   instead of copying their field lists. Explain unfamiliar terms.
3. Update progress at each milestone and stopping point. Date completed work,
   split partial work, and identify the next executable step or evidence needed.
   Distinguish implementation, deterministic checks, and observed deployment.
   Record discoveries with evidence and decisions with rationale.
4. Keep one active plan per outcome. Remove shipped implementation instructions
   from remaining work and link to their maintained guides. Summarize long
   histories with an immutable Git link while retaining execution-critical
   decisions, unresolved questions, and acceptance evidence. A separate completed
   record is useful when a delivered milestone has its own readers or handoff.
5. When the outcome is verified, move the plan to `completed/`, update links,
   and put operating instructions in the subject guide. Transfer deferred work
   to an issue or [tech debt](tech-debt.md); do not keep shipped work active for
   an optional question. Completed records retain dated outcomes and evidence,
   not an alternative current runbook.

Do not shorten a plan by removing prerequisites or proof. A fresh reader must be
able to execute the next milestone without a chat transcript, private memory, or
unrecorded external decision. A blocked discovery milestone can name the missing
evidence and how to obtain it; it must not present an assumption as a verified fact.

These conventions adapt OpenAI's [harness engineering article](https://openai.com/index/harness-engineering/)
and [execution-plan example](https://developers.openai.com/cookbook/articles/codex_exec_plans):
a small entry point, indexed repository knowledge, living progress/decision logs,
and observable acceptance. We adopt the execution-plan example's separate steps,
recovery, evidence, and interface sections as our repository convention; this is
an adaptation of published practice, not a universally required OpenAI format.
Existing checks validate links and headings, not semantic accuracy or deployment.

## Active

Each plan records its own progress and evidence. This index points to the
remaining outcome rather than repeating implementation status.

| Plan | Remaining outcome |
| --- | --- |
| [Git-defined GTFS adoption](active/gtfs-git-release-definition.md) | Review the first definition and verify exact Pages deployment, site import, retention, and ordinary redeployment. |
| [GTFS realtime evidence](active/gtfs-static-realtime.md) | Prove alert ingestion and collect trip-update evidence before designing runtime behavior. |
| [Direct-to-main ingestion](active/direct-main-ingestion.md) | Finish replay and guards, measure shadow readiness, and prove a staged cutover. |
| [Evidence attribution](active/data-licensing-attribution.md) | Verify artifact gaps, finish attribution/discovery, and resolve crowd-report inbound terms. |
| [Schematic map migration](active/schematic-system-map.md) | Accept baseline coverage/rendering, prove the consumer boundary, and migrate timeline versions. |

## Completed

### Timetables

- [Static schedule implementation](completed/gtfs-static-schedules.md): inspection,
  mapping, timetable contracts, queries, and reviewed Pages packaging; links to
  the original detailed chronology.
- [First and last train data](completed/station-first-last-train-data.md): station
  timings and frequency helper, with optional coverage work moved to tech debt.
- [GTFS calendar publication](completed/gtfs-calendar-publication.md): automatic
  source exceptions and stopping patterns, exact import recovery and verified deployment.
- [Automatic GTFS publication](completed/gtfs-automatic-publication.md):
  checked routine successors, exception review and verified production activation.
- [GTFS release retention](completed/gtfs-release-retention.md): compact reviewed
  inputs, exact replay and bounded current/previous ready bundles.

### Ingestion and repository migration

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
