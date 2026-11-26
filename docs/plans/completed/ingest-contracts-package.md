# Ingest Contracts Package

Status: completed. The package exists as `@mrtdown/ingest-contracts`, exports
the shared payload schemas, and is consumed by `@mrtdown/triage`.

## Goal

Publish the ingest webhook payload contract independently from
`@mrtdown/triage` so external evidence producers can validate and type payloads
without depending on triage's LLM/runtime implementation.

## Package Boundary

- `@mrtdown/ingest-contracts` owns public webhook payload schemas and inferred
  TypeScript types.
- `@mrtdown/triage` owns ingestion behavior: triage, claim extraction, issue
  creation, evidence creation, and impact event persistence.
- `@mrtdown/core` remains limited to canonical target-layout MRTDown data
  schemas and shared helpers.

## Current contract

Use the [package guide](../../../packages/ingest-contracts/README.md) and exported
schemas for payload fields and aliases. The initial API inventory is preserved
in the [original implementation record](https://github.com/foldaway/mrtdown-data/blob/f4f0412c23d56207f60929f4c06b605cf1974295/docs/plans/completed/ingest-contracts-package.md).

## Historical implementation sequence

1. Add `packages/ingest-contracts` with only Zod payload schemas and types.
2. Make `@mrtdown/triage` depend on `@mrtdown/ingest-contracts` for webhook
   payload validation.
3. Keep triage ingest implementation files private to `@mrtdown/triage`.
4. Publish `@mrtdown/ingest-contracts` as a public package so crawler repos can
   validate payloads before sending them.
5. Evolve the payload contract through changesets and semver, separate from
   triage implementation changes.
