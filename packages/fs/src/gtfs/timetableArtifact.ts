import {
  ScheduledAssignedTimetableSchema,
  ScheduledTimetableArtifactManifestSchema,
  ScheduledTimetableArtifactMetadataSchema,
} from '@mrtdown/core';
import { hashBytes } from './capture.js';

function fileIdentity(bytes: Uint8Array) {
  return { sha256: hashBytes(bytes), byteLength: bytes.byteLength };
}

/** Callers verify source and canonical provenance before preparing this storage bundle. */
export function prepareScheduledTimetableArtifact(
  timetableInput: unknown,
  metadataInput: unknown,
) {
  const timetable = ScheduledAssignedTimetableSchema.parse(timetableInput);
  const metadata =
    ScheduledTimetableArtifactMetadataSchema.parse(metadataInput);
  const timetableBytes = Buffer.from(JSON.stringify(timetable));
  const noticeBytes = Buffer.from(
    [
      metadata.capture.attribution,
      `Source: LTA DataMall GTFSScheduleTrain (${metadata.capture.source}).`,
      `Accessed: ${metadata.capture.retrieved_at}.`,
      `Upstream licence: ${metadata.capture.licence_reference}`,
      `Current licence: ${metadata.currentLicenceReference}`,
      '',
      `LTA-derived schedule snapshot for ${metadata.feedRange.startDate} through ${metadata.feedRange.endDate}.`,
      'Scheduled times are not live predictions. MRTDown independently maps the source data. No official status or LTA endorsement is claimed.',
      'MRTDown-authored mappings and export metadata: CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/).',
      'The upstream schedule remains subject to its own licence.',
      '',
    ].join('\n'),
  );
  const manifest = ScheduledTimetableArtifactManifestSchema.parse({
    ...metadata,
    timetable: fileIdentity(timetableBytes),
    notice: fileIdentity(noticeBytes),
  });
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  return {
    manifest,
    manifestBytes,
    manifestSha256: hashBytes(manifestBytes),
    timetableBytes,
    noticeBytes,
    generationEligible: false as const,
  };
}

/** The expected manifest digest must come from an independently trusted source. */
export function verifyScheduledTimetableArtifact(
  manifestBytes: Uint8Array,
  expectedManifestSha256: string,
  files: { timetableBytes: Uint8Array; noticeBytes: Uint8Array },
) {
  if (
    !/^[a-f0-9]{64}$/.test(expectedManifestSha256) ||
    hashBytes(manifestBytes) !== expectedManifestSha256
  ) {
    throw new Error(
      'Scheduled timetable manifest does not match its expected SHA-256',
    );
  }
  const manifest = ScheduledTimetableArtifactManifestSchema.parse(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes)),
  );
  for (const [name, bytes] of [
    ['timetable', files.timetableBytes],
    ['notice', files.noticeBytes],
  ] as const) {
    const expected = manifest[name];
    if (
      expected.byteLength !== bytes.byteLength ||
      expected.sha256 !== hashBytes(bytes)
    ) {
      throw new Error(
        `Scheduled timetable ${name} does not match its recorded size and SHA-256`,
      );
    }
  }
  const timetable = ScheduledAssignedTimetableSchema.parse(
    JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(files.timetableBytes),
    ),
  );
  return { manifest, timetable };
}
