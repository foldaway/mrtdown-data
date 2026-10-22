#!/usr/bin/env bash
set -euo pipefail

npm run check
npm run build:packages
npm run data:validate
npm run fixtures:validate
npm test
npm run test:packages
npm run pages:build
