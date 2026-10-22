import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  GtfsReconciliationIdentitySchema,
  ScheduledTimetableArtifactMetadataSchema,
} from '@mrtdown/core';
import {
  exportGtfsTimetableRelease,
  inspectGtfsTimetableRelease,
} from '@mrtdown/fs';
import z from 'zod';
import { readOption } from '../args.js';
import { acquireGtfsTerms, gtfsLicenceReference } from '../gtfsTerms.js';
import type { CliIO, GlobalOptions } from '../types.js';

const recordPath = z.string().trim().min(1);
const configSchema = ScheduledTimetableArtifactMetadataSchema.pick({
  correctionRevision: true,
}).extend({
  schemaVersion: z.literal(1),
  canonicalCommit: GtfsReconciliationIdentitySchema.shape.canonicalCommit,
  mappingVersion: z.string().trim().min(1),
  currentLicenceReference: z.literal(gtfsLicenceReference),
  draft: recordPath,
  mappingApproval: recordPath.optional(),
  releaseReview: recordPath.optional(),
});

export async function runGtfsRelease(
  args: string[],
  globals: GlobalOptions,
  io: CliIO,
) {
  const file = readOption(args, '--file', { required: true });
  const capture = readOption(args, '--capture', { required: true });
  const configFile = readOption(args, '--config', { required: true });
  const output = readOption(args, '--out');
  if (args.length) {
    throw new Error(`Unexpected GTFS release arguments: ${args.join(' ')}`);
  }
  const configPath = resolve(globals.cwd, configFile ?? '');
  async function readJson(path: string) {
    return JSON.parse(await readFile(path, 'utf8'));
  }
  const config = configSchema.parse(await readJson(configPath));
  const {
    schemaVersion: _,
    draft,
    mappingApproval,
    releaseReview,
    ...settings
  } = config;
  const options = {
    ...settings,
    dataDir: globals.dataDir,
    draft: await readJson(resolve(dirname(configPath), draft)),
    mappingApproval: mappingApproval
      ? await readJson(resolve(dirname(configPath), mappingApproval))
      : undefined,
    releaseReview: releaseReview
      ? await readJson(resolve(dirname(configPath), releaseReview))
      : undefined,
    currentTerms: await acquireGtfsTerms(),
    releaseInstant: new Date().toISOString(),
  };
  const source = resolve(globals.cwd, file ?? '');
  const handoff = resolve(globals.cwd, capture ?? '');
  const result = output
    ? await exportGtfsTimetableRelease(
        source,
        handoff,
        resolve(globals.cwd, output),
        options,
      )
    : await inspectGtfsTimetableRelease(source, handoff, options);
  io.stdout(
    JSON.stringify(
      {
        schemaVersion: 1,
        documentKind: 'gtfs-timetable-release',
        exported: 'exported' in result ? result.exported : false,
        ...('outputDirectory' in result
          ? { outputDirectory: result.outputDirectory }
          : {}),
        manifestSha256: result.manifestSha256,
        release: result.release,
        review: result.review,
        coverage: result.coverage,
        currentTerms: options.currentTerms,
      },
      null,
      2,
    ),
  );
  return result.release.eligible ? 0 : 1;
}
