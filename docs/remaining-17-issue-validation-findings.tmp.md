# Temporary Report: Remaining 8 Issue Validation Failures

## Context

- Validation command: `npm --workspace @mrtdown/cli run cli -- validate --scope issue`
- Current failure count: **8**
- Common validator error: `issue has evidence but no impact events`
- Replay/extraction observation:
  - Targeted replay recovered 2 previously failing issues:
    - `2019-09-01-sengkang-lrt-maintenance` (now has generated impact events)
    - `2023-11-03-early-closure-tel-service-adjustments` (enriched evidence + replay now generates impact events)
  - Prompt guidance was updated to force planned `reduced-service` claims for one-platform-closed-but-service-running patterns.
  - Mobile-signal-specific issue records were removed to simplify the current cleanup pass.
  - Previously recovered and no longer failing:
    - `2013-04-20-maintenance-work-at-pasir-ris`
    - `2013-06-29-pasir-ris-maintenance`
    - `2023-08-12-bplrt-early-closure`
    - `2024-11-14-bukit-panjang-lrt-services-end-early`
    - `2019-09-01-sengkang-lrt-maintenance`
    - `2023-11-03-early-closure-tel-service-adjustments`

## Root Cause Buckets

### 1) Legacy disruption evidence is too underspecified for extraction (7)

- `2011-12-14-smrt-apologises-for-circle-line-disruption`
- `2011-12-20-train-delay`
- `2011-12-29-north-bound-train-service-slow`
- `2012-04-03-south-bound-train-service-slow`
- `2012-04-24-south-bound-train-service-slow`
- `2012-04-30-west-bound-train-service-delayed`
- `2012-07-05-northbound-trains-moving-slower`

Pattern: short status-style tweets (for example, "running slower", "running well again") without enough structured entity/time detail for claims extraction.

### 2) Maintenance/infra evidence is mostly informational or non-service-impact (1)

- `2025-08-01-mrt-platform-screen-doors-renewal`

Pattern: evidence explicitly states service/frequency are not affected; extractor returns `0` claims as expected, but validator still requires non-empty impact events.

### 3) Sparse statement does not yield actionable claim (0)

No remaining issues in this bucket after evidence enrichment and replay.

Pattern previously seen in sparse station/platform statements now addressed by richer evidence + replay.

## Suggested Next Actions

1. For the 7 legacy disruption items, manually backfill impact where source evidence supports clear service effect windows.
2. Decide policy for infra notices with explicit "no service impact" text (for example `2025-08-01-mrt-platform-screen-doors-renewal`): keep strict non-empty impact requirement vs allow empty-impact infra records.
3. Re-run validator and track residuals by bucket until zero.

