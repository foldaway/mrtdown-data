# Agent Map

[README](README.md) covers setup and common workflows. Start with the
[documentation index](docs/README.md) for dataset layout, package ownership,
operating guides, and review evidence. See the
[data overhaul split](docs/plans/completed/data-overhaul-split.md) for the history
of the package, data, workflow, and deployment boundaries.

## Checks and operations

- Run `npm run check` for lint, dependency boundaries, and documentation checks.
- Run `npm test` for deterministic tests and `npm run data:validate` for canonical
  data changes. See [package scripts](package.json) for scoped builds and tests.
- Paid model evaluations and semantic replay need an intentional run with
  `OPENAI_API_KEY`. See the [triage guide](packages/triage/README.md).
- Follow the [station layout](docs/data/station-layout.md) and
  [public holiday](docs/data/public-holidays.md) guides for canonical imports.

## Proposals and plans

Follow the [documentation guidance](docs/development/writing.md) for when to
write docs, where they belong, and concise docs and PR descriptions.
Use a checklist for routine work and the [execution plan template](docs/plans/template.md)
when the [planning guide](docs/plans/README.md) calls for a versioned plan.
New and active plans must follow the [standard layout](docs/plans/README.md#standard-layout).

## Review Rules

- Prefer small PRs that isolate one concern: harness, package scaffold, core
  schemas, file-backed repositories, CLI, triage, data migration, workflows, or
  deploy cleanup.
- Keep generated data and hand-authored code in separate PRs whenever practical.
- If documentation and code disagree, fix the documentation or narrow the PR
  before adding more implementation.
- Keep commits focused on one concern. Separate schema or behavior changes from
  bulk canonical-data migrations so each commit can be reviewed and reverted
  independently.
- Before creating a commit, run `npm run lint` and the relevant deterministic
  tests. Do not commit a change that has not passed both checks.
- Use Conventional Commits style for commit messages and PR titles, for example
  `feat: add Pages artifact publishing foundation`. Do not add tool or agent
  prefixes such as `[codex]` to PR titles.
- Every commit an agent creates or amends must include a
  `Co-Authored-By: Name <email>` trailer for that agent's own identity (for
  example, `Co-Authored-By: Codex <noreply@openai.com>` for Codex). Preserve
  existing co-author trailers and add trailers for any other contributors.
- Do not merge temporary branch names, one-off deploy triggers, or local
  generated artifacts.
