# R2 Static Data Publishing Plan

## Context

`mrtdown-data` publishes reviewed canonical data as a generated static artifact.
The current publication boundary is `npm run pages:build`, which writes
`pages-dist/` with canonical data at the root and deterministic fixture data
under `fixtures/`.

The current GitHub Actions setup is:

- pull requests and non-`main` pushes build `pages-dist/` and upload it as a
  short-lived preview artifact;
- `main` builds the same artifact, deploys it to GitHub Pages, and triggers the
  `mrtdown-site` internal pull endpoint.

The proposed direction is to move the published static artifact from GitHub
Pages to Cloudflare R2 while adding explicit staging and production
environments. The generator output should remain unchanged at first. The
deployment target, credentials, cache headers, custom domains, smoke tests, and
consumer cutover should change in small isolated steps.

Related references:

- `README.md`
- `.github/workflows/pages-preview.yml`
- `.github/workflows/pages-deploy.yml`
- `scripts/build-pages-artifact.mjs`
- Cloudflare R2 public bucket and custom domain documentation
- Cloudflare R2 S3-compatible API and token documentation

## Goals

- Publish the existing static data artifact from R2.
- Add separate staging and production deployment environments.
- Keep `npm run pages:build` as the artifact generation boundary during the
  migration.
- Use separate R2 buckets and write credentials for staging and production.
- Publish through custom domains instead of relying on development-only public
  bucket URLs.
- Preserve the current artifact paths consumed by downstream systems.
- Add smoke tests that prove the published `manifest.json`, archives, and core
  paths are reachable after deployment.
- Keep GitHub Pages active during a dual-publish window until R2 publication and
  consumer import are proven.
- Update documentation and workflow names once R2 is the canonical publishing
  target.

## Non-Goals

- This plan does not change the canonical data layout.
- This plan does not redesign `pages-dist/` or the manifest schema.
- This plan does not move data generation into Cloudflare Workers.
- This plan does not make R2 the source of truth for canonical data.
- This plan does not require removing GitHub Pages before R2 has passed a
  dual-publish period.
- This plan does not change the `mrtdown-site` import contract beyond its source
  URL and environment-specific pull trigger configuration.

## Target Environments

Use separate buckets rather than staging and production prefixes in the same
bucket:

- `mrtdown-data-staging`
- `mrtdown-data-production`

Each bucket should have:

- its own custom domain;
- its own GitHub Actions write credentials;
- object read access configured only as needed for the public data contract;
- independent deployment logs and smoke tests.

Candidate public domains:

- staging: `staging-data.mrtdown...`
- production: `data.mrtdown...`

The exact hostnames should match the final `mrtdown-site` and DNS ownership
plan.

## Artifact Contract

The first R2 deployment should publish the existing artifact shape unchanged:

- `index.html`
- `manifest.json`
- `archive.tar.gz`
- `archive.zip`
- `station/`
- `line/`
- `service/`
- `operator/`
- `town/`
- `landmark/`
- `issue/`
- `fixtures/index.html`
- `fixtures/manifest.json`
- `fixtures/archive.tar.gz`
- `fixtures/archive.zip`
- fixture data directories

The migration should not require downstream consumers to learn a new object
layout. Any future path or versioning changes should be planned separately.

## Cache Policy

R2 deployment should set explicit cache metadata by path type.

Initial conservative policy:

- `index.html`: `public, max-age=60`
- `manifest.json`: `public, max-age=60`
- `fixtures/manifest.json`: `public, max-age=60`
- JSON and NDJSON data files: `public, max-age=300`
- archives: `public, max-age=300`
- generated map snapshots or future content-addressed artifacts:
  `public, max-age=31536000, immutable`, only if the path is immutable

The deploy script should keep this policy centralized so staging and production
cannot drift accidentally.

## Secrets And Configuration

Use GitHub Actions environments for R2 publication secrets. Configure separate
`staging` and `production` environments, with each environment defining the same
R2 secret names for its own bucket and credentials.

R2 environment secrets:

- `R2_ACCOUNT_ID`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BASE_URL`

Existing site pull secrets may stay environment-specific:

- `MRTDOWN_SITE_PULL_URL`
- `MRTDOWN_SITE_INTERNAL_API_TOKEN`

Production should initially use a protected GitHub Environment so publication
requires explicit approval after staging passes.

## Deployment Script

Use explicit AWS CLI commands in GitHub Actions instead of maintaining a custom
R2 upload script during the initial staging rollout.

The workflow should:

- require an explicit source directory, bucket, account id, credentials, and
  public base URL;
- refuse to run if the source directory is missing `manifest.json`,
  `archive.tar.gz`, or `archive.zip`;
- walk the generated artifact directory deterministically;
- upload files through R2's S3-compatible API using AWS CLI;
- infer and set `Content-Type`;
- set `Cache-Control` from the centralized cache policy;
- print a compact deployment summary;
- run smoke checks against the public base URL after upload.

The first version can be intentionally simple. A shared script can be added later
if staging and production workflows start duplicating too much logic.

## Workflow Shape

### Preview

Keep the existing preview behavior initially:

- build `pages-dist/`;
- upload it as a short-lived GitHub Actions artifact;
- do not deploy arbitrary pull request contents to a public shared R2 bucket.

Per-PR R2 previews can be reconsidered later if there is a concrete review need
and a cleanup policy.

### Staging

Add an R2 staging deploy workflow.

Initial trigger:

- `workflow_dispatch`

Follow-up trigger after confidence:

- push to `main`, before production deployment

Required steps:

- check out the repository;
- install dependencies;
- run `npm run pages:build`;
- deploy `pages-dist/` to the staging bucket;
- smoke test `R2_PUBLIC_BASE_URL` from the staging environment;
- trigger the staging `mrtdown-site` pull endpoint if that environment exists.

### Production

Add an R2 production deploy workflow or extend the staging workflow with a
production environment job.

Initial trigger:

- manual approval after staging succeeds

Longer-term trigger:

- push to `main`, with production protected by GitHub Environment rules if
  useful

Required steps:

- reuse or rebuild the same artifact from the same commit;
- deploy to the production bucket;
- smoke test `R2_PUBLIC_BASE_URL` from the production environment;
- trigger the production `mrtdown-site` pull endpoint.

## Rollout Phases

### Phase 1: Plan And Provision

Status: complete. Staging and production R2 buckets, custom domains, bucket
write credentials, and GitHub Actions environments/secrets are provisioned.

- Create the staging and production R2 buckets.
- Attach custom domains.
- Create bucket-scoped write credentials.
- Add GitHub Actions secrets and environments.
- Keep GitHub Pages unchanged.

### Phase 2: Staging Publish

Status: in progress. The manual staging workflow is added; manual staging
publication and downstream import verification remain.

- Add the staging workflow.
- Run staging publication manually.
- Verify public access, cache headers, archive downloads, and manifest content.
- Verify a staging `mrtdown-site` pull can import from the R2 URL if that
  environment exists.

### Phase 3: Dual Publish

- Add production R2 publication while GitHub Pages stays active.
- Publish both targets from `main`.
- Compare key files between GitHub Pages and R2:
  - `manifest.json`
  - `archive.tar.gz`
  - `archive.zip`
  - representative entity and issue paths
- Run several successful production R2 deployments before switching consumers.

### Phase 4: Consumer Cutover

- Update `mrtdown-site` production configuration to import from the R2
  production URL.
- Keep the existing pull trigger behavior, changing only the source data URL and
  environment-specific endpoint configuration.
- Monitor import success and public data availability.

### Phase 5: GitHub Pages Cleanup

- Rename docs and workflow language from Pages-specific publication to static
  data publication.
- Add a neutral build script name such as `data:artifact:build` if useful, while
  keeping `pages:build` as a compatibility alias for at least one transition
  window.
- Remove the GitHub Pages deploy workflow only after production R2 publication
  is stable.
- Update `README.md`, `AGENTS.md`, and completed migration notes as needed.

## Validation

The deterministic repository checks should remain:

- `npm run check`
- `npm run typecheck`
- `npm test`
- `npm run pages:build`
- `npm run data:validate`

R2-specific validation should include:

- deploy script unit tests for cache policy and content type selection;
- dry-run behavior that proves required files are present;
- staging smoke tests against the custom domain;
- production smoke tests after deployment;
- optional archive integrity checks that download and inspect the published
  archive.

## Open Questions

- What exact staging and production hostnames should be used?
- Should production deploy automatically after staging, or require approval for
  the first few releases?
- Should the production workflow rebuild the artifact or reuse a build artifact
  produced by the staging job from the same commit?
- Should stale remote object deletion be enabled immediately, or only after the
  upload path is proven?
- Does `mrtdown-site` need distinct staging and production pull endpoints before
  this migration begins?
