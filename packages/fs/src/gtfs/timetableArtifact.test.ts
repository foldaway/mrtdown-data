import { describe, expect, it } from 'vitest';
import { hashBytes } from './capture.js';
import {
  prepareScheduledTimetableArtifact,
  verifyScheduledTimetableArtifact,
} from './timetableArtifact.js';

function inputs() {
  const timetable = {
    schemaVersion: 1,
    timetable: {
      schemaVersion: 1,
      timeZone: 'Asia/Singapore',
      calendars: [
        {
          providerCalendarId: 'C',
          weekly: null,
          exceptions: [{ date: '2026-01-01', available: true }],
        },
      ],
      trips: [
        {
          providerTripId: 'T',
          providerRouteId: 'R',
          providerCalendarId: 'C',
          stopTimes: [
            '09007199254740992',
            '9007199254740993',
            '9007199254740994',
          ].map((stopSequence, index) => ({
            providerTripId: 'T',
            providerStopId: 'P',
            stopSequence,
            arrivalSeconds: index === 1 ? null : 90000,
            departureSeconds: index === 1 ? null : 90000,
            pickupType: 1,
            dropOffType: 3,
            timepoint: 0,
          })),
        },
      ],
    },
    patterns: [
      {
        id: 'p',
        pattern: {
          lineId: 'L',
          serviceId: 'SVC',
          revisionId: 'r1',
          destinationStationId: 'S',
          stops: [0, 1, 2].map(() => ({
            stationId: 'S',
            platformIds: ['A', 'B'],
          })),
        },
      },
    ],
    assignments: [
      {
        providerTripId: 'T',
        patternId: 'p',
        dateRanges: [{ startDate: '2026-01-01', endDate: '2026-01-01' }],
      },
    ],
  };
  const metadata = {
    schemaVersion: 1,
    documentKind: 'scheduled-timetable-artifact',
    correctionRevision: 1,
    capture: {
      schema_version: 1,
      capture_id: 'synthetic',
      feed_kind: 'schedule',
      source:
        'https://datamall2.mytransport.sg/ltaodataservice/GTFSScheduleTrain',
      retrieved_at: '2026-01-01T00:00:00Z',
      provider_timestamp: null,
      sha256: 'a'.repeat(64),
      byte_length: 123,
      archive_ref: 'synthetic/schedule.zip',
      attribution: 'Synthetic source attribution',
      rights_status: 'pending_review',
      licence_reference: 'https://example.test/original-licence',
    },
    identity: {
      sourceManifest: { 'trips.txt': 'b'.repeat(64) },
      canonicalCommit: 'c'.repeat(40),
      topology: { projectionVersion: 1, sha256: 'd'.repeat(64) },
    },
    mapping: {
      version: 'synthetic-v1',
      draftSha256: 'e'.repeat(64),
      assignmentsSha256: 'f'.repeat(64),
    },
    feedRange: { startDate: '2026-01-01', endDate: '2026-01-31' },
    sourceFeedInfo: [
      {
        feed_version: '0.1',
        feed_publisher_name: 'Synthetic publisher',
        feed_lang: 'en',
      },
    ],
    currentLicenceReference: 'https://example.test/current-licence',
    mrtdownLicence: 'CC-BY-4.0',
  };
  return { timetable, metadata };
}

describe('scheduled timetable artifact', () => {
  it('prepares reproducible bytes with source attribution and verifies them without changing timing or claiming approval', () => {
    const { timetable, metadata } = inputs();
    const before = JSON.stringify({ timetable, metadata });
    const prepared = prepareScheduledTimetableArtifact(timetable, metadata);
    expect(prepareScheduledTimetableArtifact(timetable, metadata)).toEqual(
      prepared,
    );
    expect(prepared.generationEligible).toBe(false);
    expect(prepared.manifest).toMatchObject(metadata);
    expect(prepared.manifest.timetable).toEqual({
      sha256: hashBytes(prepared.timetableBytes),
      byteLength: prepared.timetableBytes.byteLength,
    });
    expect(prepared.manifest.notice).toEqual({
      sha256: hashBytes(prepared.noticeBytes),
      byteLength: prepared.noticeBytes.byteLength,
    });
    expect(prepared.manifestSha256).toBe(hashBytes(prepared.manifestBytes));
    expect(
      verifyScheduledTimetableArtifact(
        prepared.manifestBytes,
        prepared.manifestSha256,
        prepared,
      ),
    ).toEqual({ manifest: prepared.manifest, timetable });
    const notice = prepared.noticeBytes.toString('utf8');
    for (const text of [
      metadata.capture.attribution,
      metadata.capture.source,
      metadata.capture.retrieved_at,
      metadata.capture.licence_reference,
      metadata.currentLicenceReference,
      'CC-BY-4.0',
      'not live predictions',
      metadata.feedRange.endDate,
    ]) {
      expect(notice).toContain(text);
    }
    expect(JSON.stringify({ timetable, metadata })).toBe(before);
  });

  it('rejects modified manifests, wrong trusted hashes, and damaged or missing companion files', () => {
    const { timetable, metadata } = inputs();
    const prepared = prepareScheduledTimetableArtifact(timetable, metadata);
    expect(() =>
      verifyScheduledTimetableArtifact(
        Buffer.from('{}'),
        prepared.manifestSha256,
        prepared,
      ),
    ).toThrow('manifest does not match');
    expect(() =>
      verifyScheduledTimetableArtifact(
        prepared.manifestBytes,
        '0'.repeat(64),
        prepared,
      ),
    ).toThrow('manifest does not match');
    for (const key of ['timetableBytes', 'noticeBytes'] as const) {
      const damaged = Buffer.from(prepared[key]);
      damaged[0] ^= 1;
      for (const bytes of [damaged, Buffer.alloc(0)]) {
        expect(() =>
          verifyScheduledTimetableArtifact(
            prepared.manifestBytes,
            prepared.manifestSha256,
            { ...prepared, [key]: bytes },
          ),
        ).toThrow('recorded size and SHA-256');
      }
    }
  });

  it('validates content even when its bytes match the manifest hashes', () => {
    const { timetable, metadata } = inputs();
    const prepared = prepareScheduledTimetableArtifact(timetable, metadata);
    for (const timetableBytes of [
      Buffer.from(JSON.stringify({ ...timetable, patterns: [] })),
      Buffer.from([0xff]),
    ]) {
      const manifestBytes = Buffer.from(
        JSON.stringify({
          ...prepared.manifest,
          timetable: {
            sha256: hashBytes(timetableBytes),
            byteLength: timetableBytes.byteLength,
          },
        }),
      );
      expect(() =>
        verifyScheduledTimetableArtifact(
          manifestBytes,
          hashBytes(manifestBytes),
          { ...prepared, timetableBytes },
        ),
      ).toThrow();
    }
  });

  it('rejects unsupported formats, invalid provenance, revision and feed range, and eligibility claims', () => {
    const { timetable, metadata } = inputs();
    for (const changes of [
      { schemaVersion: 2 },
      { correctionRevision: 0 },
      { feedRange: { startDate: '2026-02-01', endDate: '2026-01-01' } },
      { capture: { ...metadata.capture, feed_kind: 'trip_updates' } },
      { identity: { ...metadata.identity, canonicalCommit: 'main' } },
      { mapping: { ...metadata.mapping, draftSha256: 'unverified' } },
      { generationEligible: true },
    ]) {
      expect(() =>
        prepareScheduledTimetableArtifact(timetable, {
          ...metadata,
          ...changes,
        }),
      ).toThrow();
    }
  });
});
