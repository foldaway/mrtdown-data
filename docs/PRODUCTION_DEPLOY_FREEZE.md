# Production Deploy Freeze

Fly production deploys from this repository are temporarily frozen during the
data-overhaul transition.

The legacy Fly deploy workflow has been removed because the active production
build path still depends on the removed `data/source/` layout. Keeping the
workflow enabled would risk a broken deploy on the next `main` push.

This freeze is intentionally narrow:

- GitHub Pages static data artifact generation remains active.
- Webhook ingest remains active through the target-layout `@mrtdown/triage`
  package flow.
- `Dockerfile`, `fly.toml`, and legacy runtime/API code remain in place for the
  Step 8 runtime removal and deploy cleanup split.
- Re-enable production serving only after `mrtdown-site` owns the runtime target
  or after a reviewed replacement deploy path exists.
