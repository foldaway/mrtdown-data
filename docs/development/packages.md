# Packages and checks

The packages separate data definitions, file access, and evidence processing:

| Package | Purpose and dependencies |
| --- | --- |
| `core` | Schemas, time helpers, and state helpers; independent of the other packages. |
| `ingest-contracts` | Webhook payload schemas; independent of the other packages. |
| `fs` | Read, write, validate, and export files; depends on `core`. |
| `triage` | Process evidence and replay outcomes; depends on `core`, `fs`, and `ingest-contracts`. |
| `cli` | Provide command-line access to the tools; depends on `core`, `fs`, and `triage`. |

Run the repository checks and deterministic tests before committing:

```bash
npm run check  # Lint, package boundaries, links, and active plan structure
npm test       # Deterministic tests; generates fixtures first
```

`npm run lint` runs lint checks alone. Package-specific build and test commands
are listed in [package.json](../../package.json). Tests and examples use generated
data in `fixtures/generated/data`; recorded ingestion cases live in
`fixtures/triage-regressions`.

Keep generated output out of commits and separate bulk data changes from code
changes where practical. See [AGENTS.md](../../AGENTS.md) for contribution rules and
[the documentation index](../README.md) for operating guides,
execution plans, and migration history.
