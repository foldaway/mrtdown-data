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

## Public API

The contract package exports:

- `IngestContentTwitterSchema` and `IngestContentTwitter`
- `IngestContentRedditSchema` and `IngestContentReddit`
- `IngestContentNewsArticleSchema` and `IngestContentNewsArticle`
- `IngestContentSchema` and `IngestContent`
- `IngestPayloadSchema` and `IngestPayload`

`IngestMessageSchema` and `IngestMessage` remain aliases for the initial
transition from the older internal name. New consumers should use
`IngestPayload`.

## Execution Plan

1. Add `packages/ingest-contracts` with only Zod payload schemas and types.
2. Make `@mrtdown/triage` depend on `@mrtdown/ingest-contracts` for webhook
   payload validation.
3. Keep triage ingest implementation files private to `@mrtdown/triage`.
4. Publish `@mrtdown/ingest-contracts` as a public package so crawler repos can
   validate payloads before sending them.
5. Evolve the payload contract through changesets and semver, separate from
   triage implementation changes.
