# Writing and organizing documentation

## When to write docs

Update docs when a change affects how someone uses, operates, or maintains the
repository, or when a decision needs context that code cannot explain. Cover
behavior, source policy, ownership boundaries, prerequisites, recovery steps,
and tradeoffs that a future reader would otherwise have to reconstruct.

- Update the existing subject guide in the same PR as the behavior change.
- Use the PR description for a bounded change's explanation and validation.
  Routine fixes and refactors do not need a separate document unless they
  change a documented contract or procedure.
- Write a new guide only for a distinct, recurring reader task with no existing
  home. Extend an existing guide before adding a file or another index.
- Use an [execution plan](../plans/README.md) for work spanning ordered PRs,
  repositories, or a coordinated cutover. Keep routine work in a checklist.
- Keep dated review evidence when it supports a mapping, source, or release
  decision. Summarize the result and link to the full reports.

Do not add docs just to narrate the implementation, list files or schema fields,
repeat CLI help, or record a chat transcript. Link to the owning source instead.

## Where docs belong

Organize by subject, then by the reader's task. Give each fact one maintained
home; indexes and agent instructions should point there. Reuse existing subject
folders before creating a new category.

| Content | Home |
| --- | --- |
| Setup and common commands | [Repository README](../../README.md) |
| Canonical record conventions and source policies | `docs/data/` |
| Package ownership, checks, and contributor guidance | `docs/development/` |
| Static export and deployment procedures | `docs/operations/` |
| GTFS procedures and contracts | `docs/gtfs/operations/` and `docs/gtfs/reference/` |
| GTFS capture evidence and mapping decisions | `docs/gtfs/captures/` and `docs/gtfs/reviews/` |
| Schematic map authoring and reference evidence | `docs/schematic-map/` |
| Resumable work, decisions, and implementation history | `docs/plans/active/`, then `docs/plans/completed/` |
| Package-specific usage | The owning package's README |

Link a new guide from the nearest subject index, or the
[documentation index](../README.md) when there is no subject index. Add another
index only when it helps readers choose between several documents. When moving
a file, update inbound links and tool paths; preserve evidence bytes and explain
historical paths where reproducibility requires them.

Keep operating instructions in guides and project progress in plans. When work
finishes, update the guide, capture the outcome in the plan, and move the plan
to completed. Historical evidence establishes what was checked at that time;
it does not establish current deployment state.

## Write concisely

- Lead with the behavior or proposed change, why it matters, and any decision
  needed. Write for a busy reader without the original conversation.
- Use familiar words, concrete examples, and active verbs. Explain domain
  terms only when the reader needs them to act.
- Match detail to the change. Keep paragraphs short; use bullets for parallel
  points, numbered steps for procedures, and tables for comparisons.
- Keep rationale, relevant tradeoffs, failure modes, and evidence. Link to code,
  schemas, tests, workflows, or reports for details they already explain.
- Keep plans resumable from a fresh checkout. Include the assumptions,
  decisions, commands, expected results, and recovery steps execution depends
  on; concision must not remove them. Summarize required external context in
  the repo rather than relying on chat history or an external link alone.
- Distinguish verified facts, assumptions, proposals, and remaining work. State
  how to verify the outcome and recover from a failed cutover when relevant.
- For proposals, state the recommendation, its tradeoff, and what evidence
  would change it.
- Cut repeated context, implementation walkthroughs, abandoned approaches, and
  summaries that repeat the opening. Use headings only when they help scanning.

## PR descriptions

Use a concise, feature-oriented title and body. Lead with the concrete problem
and resulting behavior; use a before/after example when it clarifies the change.
A small PR usually needs one or two sentences or a few bullets plus validation.
Include only technical details, risks, and limitations that affect review.

Describe the final change for someone without the conversation or GTFS context.
Rewrite the title and body when scope changes. Keep independent concerns in
separate PRs, and link to durable guides or evidence instead of pasting them.

## Keep docs current

When touching a subject, check its guide and active plan against the owning
code. Correct stale claims, merge repeated explanations into their owning guide,
and update links. Summarize superseded plan detail with a link to its exact Git
revision when the history matters; retain decision rationale and review evidence.
Use `npm run check:docs` for links and active-plan headings, then review meaning
and freshness yourself. The check does not establish that a claim is still true.

This applies OpenAI's [harness engineering guidance](https://openai.com/index/harness-engineering/):
short entry points, indexed repository knowledge, and checks that expose drift.
The [execution-plan example](https://developers.openai.com/cookbook/articles/codex_exec_plans)
informs our plan template. These are adapted to this repository's review and
publication rules; their example folder names are not required conventions.
