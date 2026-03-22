import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Manifest } from '@mrtdown/core';
import { FileStore, MRTDownRepository } from '@mrtdown/fs';

const MANIFEST_VERSION = 1;

export interface ManifestCliOptions {
  dataDir: string;
  output?: string;
}

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function buildManifest(dataDir: string): Manifest {
  const store = new FileStore(dataDir);
  const repo = new MRTDownRepository({ store });

  return {
    manifestVersion: MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    lines: Object.fromEntries(
      repo.lines.list().map((line) => {
        return [line.id, sha256(JSON.stringify(line))];
      }),
    ),
    stations: Object.fromEntries(
      repo.stations.list().map((station) => {
        return [station.id, sha256(JSON.stringify(station))];
      }),
    ),
    towns: Object.fromEntries(
      repo.towns.list().map((town) => {
        return [town.id, sha256(JSON.stringify(town))];
      }),
    ),
    landmarks: Object.fromEntries(
      repo.landmarks.list().map((landmark) => {
        return [landmark.id, sha256(JSON.stringify(landmark))];
      }),
    ),
    operators: Object.fromEntries(
      repo.operators.list().map((operator) => {
        return [operator.id, sha256(JSON.stringify(operator))];
      }),
    ),
    services: Object.fromEntries(
      repo.services.list().map((service) => {
        return [service.id, sha256(JSON.stringify(service))];
      }),
    ),
    issues: Object.fromEntries(
      repo.issues.list().map((issueBundle) => {
        return [issueBundle.issue.id, sha256(JSON.stringify(issueBundle))];
      }),
    ),
  };
}

export function runManifest(opts: ManifestCliOptions): number {
  const manifest = buildManifest(opts.dataDir);
  const json = `${JSON.stringify(manifest, null, 2)}\n`;

  const filePath = resolve(opts.dataDir, 'manifest.json');

  writeFileSync(filePath, json, 'utf-8');

  return 0;
}
