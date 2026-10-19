import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { hashBytes } from './capture.js';
import { groupedScopedReviewDraftSha256 } from './groupedReviewContract.js';
import { readSchedule } from './schedule.js';
import { scopedReviewDraftSha256 } from './scopedReviewContract.js';
import {
  createGroupedScopedReconciliationDraft,
  createScopedReconciliationDraft,
} from './scopedReviewDraft.js';
import { verifyScheduledTimetableArtifact } from './timetableArtifact.js';
import { readScheduleTopology } from './topology.js';
import { prepareVerifiedGtfsTimetableArtifact } from './verifiedTimetableArtifact.js';

async function fixture(
  root: string,
  grouped = false,
  overrides: Record<string, string> = {},
) {
  const tables = {
    'agency.txt':
      'agency_id,agency_name,agency_url,agency_timezone\nSMRT,Synthetic,https://example.test/,Asia/Singapore\n',
    'routes.txt': 'route_id,agency_id,route_type\nNSL_TEST,SMRT,1\n',
    'stops.txt': `stop_id,stop_name,stop_code,location_type,parent_station,platform_code\nS,S,NS1,1,,\nP,P,NS1,0,S,${grouped ? 'A/C' : 'A'}\nD,D,NS2,1,,\nQ,Q,NS2,0,D,B\n`,
    'trips.txt':
      'trip_id,route_id,service_id\n0009007199254740993,NSL_TEST,C\n',
    'stop_times.txt':
      'trip_id,stop_id,stop_sequence,arrival_time,departure_time\n0009007199254740993,P,09007199254740992,25:00:00,25:00:00\n0009007199254740993,Q,9007199254740993,25:30:00,25:30:00\n',
    'calendar_dates.txt':
      'service_id,date,exception_type\nC,20260101,1\nC,20260102,1\n',
    'feed_info.txt':
      'feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version\nSynthetic,https://example.test/,en,20260101,20260107,0.1\n',
    ...overrides,
  };
  const bytes = zipSync(
    Object.fromEntries(
      Object.entries(tables).map(([name, text]) => [name, strToU8(text)]),
    ),
    { mtime: new Date('2000-01-01T00:00:00Z') },
  );
  const capture = {
    schema_version: 1,
    capture_id: 'synthetic',
    feed_kind: 'schedule',
    source:
      'https://datamall2.mytransport.sg/ltaodataservice/GTFSScheduleTrain',
    retrieved_at: '2026-01-15T00:00:00Z',
    provider_timestamp: null,
    sha256: hashBytes(bytes),
    byte_length: bytes.length,
    archive_ref: 'synthetic/schedule.zip',
    attribution: 'Synthetic attribution',
    rights_status: 'pending_review',
    licence_reference: 'https://example.test/original-terms',
  };
  await writeFile(join(root, 'schedule.zip'), bytes);
  await writeFile(join(root, 'capture.json'), JSON.stringify(capture));
  const name = { 'en-SG': 'Synthetic', 'zh-Hans': null, ms: null, ta: null };
  const records = [
    [
      'operator',
      { id: 'SMRT_TRAINS', name, foundedAt: '2000-01-01', url: null },
    ],
    [
      'line',
      {
        id: 'NSL',
        name,
        type: 'mrt.high',
        color: '#000000',
        startedAt: null,
        platformDoorCount: 24,
        trainCarCounts: [1],
        serviceIds: ['SVC'],
        operators: [
          { operatorId: 'SMRT_TRAINS', startedAt: null, endedAt: null },
        ],
      },
    ],
    [
      'service',
      {
        id: 'SVC',
        name,
        lineId: 'NSL',
        revisions: [
          {
            id: 'r1',
            startAt: '2000-01-01',
            endAt: null,
            path: {
              stations: [
                { stationId: 'S', displayCode: 'NS1' },
                { stationId: 'D', displayCode: 'NS2' },
              ],
            },
            operatingHours: {
              weekdays: { start: '05:00', end: '01:00' },
              weekends: { start: '05:00', end: '01:00' },
            },
          },
        ],
      },
    ],
    ...['S', 'D'].map((id, index) => [
      'station',
      {
        id,
        name,
        geo: { latitude: 0, longitude: 0 },
        townId: 'T',
        landmarkIds: [],
        stationCodes: [
          {
            lineId: 'NSL',
            code: `NS${index + 1}`,
            startedAt: '2000-01-01',
            endedAt: null,
            structureType: 'at_grade',
          },
        ],
        layout: {
          platforms: (index ? ['B'] : grouped ? ['A', 'C'] : ['A']).map(
            (id) => ({
              id,
              label: id,
              lineId: 'NSL',
              lastUpdated: '2026-01-01',
            }),
          ),
        },
      },
    ]),
  ] as [string, { id: string }][];
  for (const [kind, record] of records) {
    await mkdir(join(root, 'data', kind), { recursive: true });
    await writeFile(
      join(root, 'data', kind, `${record.id}.json`),
      JSON.stringify(record),
    );
  }
  const { tables: parsed, manifest } = readSchedule(bytes);
  const topology = await readScheduleTopology(join(root, 'data'));
  const identity = {
    sourceManifest: manifest,
    canonicalCommit: 'a'.repeat(40),
    topology: {
      projectionVersion: 1,
      sha256: hashBytes(Buffer.from(JSON.stringify(topology))),
    },
  };
  const draft = (
    grouped
      ? createGroupedScopedReconciliationDraft
      : createScopedReconciliationDraft
  )(
    { tables: parsed, topology, identity },
    { pilotLineIds: ['NSL'], preparedBy: 'Synthetic proposal' },
  );
  return {
    capture,
    identity,
    options: {
      dataDir: join(root, 'data'),
      canonicalCommit: identity.canonicalCommit,
      draft,
      mappingVersion: 'synthetic-v1',
      correctionRevision: 1,
      currentLicenceReference: 'https://example.test/current-terms',
    },
  };
}

describe('verified timetable artifact preparation', () => {
  it('derives source, mapping and feed metadata from verified files and a version-2 draft', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-verified-artifact-'));
    try {
      const { capture, identity, options } = await fixture(root);
      const run = () =>
        prepareVerifiedGtfsTimetableArtifact(
          join(root, 'schedule.zip'),
          join(root, 'capture.json'),
          options,
        );
      const result = await run();
      const repeat = await run();
      expect(repeat.manifestBytes).toEqual(result.manifestBytes);
      expect(repeat.timetableBytes).toEqual(result.timetableBytes);
      expect(repeat.noticeBytes).toEqual(result.noticeBytes);
      expect(result.manifest).toMatchObject({
        capture,
        identity,
        mapping: {
          version: 'synthetic-v1',
          draftSha256: scopedReviewDraftSha256(options.draft),
        },
        feedRange: { startDate: '2026-01-01', endDate: '2026-01-07' },
        sourceFeedInfo: [{ feed_version: '0.1', feed_start_date: '20260101' }],
      });
      expect(result.review.readiness).toBe('unapproved');
      expect(result.generationEligible).toBe(false);
      expect(result.coverage).toMatchObject({
        sourceTripDateCount: 2,
        assignedTripDateCount: 2,
        missingTripDateCount: 0,
      });
      const { timetable } = verifyScheduledTimetableArtifact(
        result.manifestBytes,
        result.manifestSha256,
        result,
      );
      expect(timetable.timetable.trips[0]).toMatchObject({
        providerTripId: '0009007199254740993',
        stopTimes: [
          { stopSequence: '09007199254740992', departureSeconds: 90000 },
          { stopSequence: '9007199254740993', departureSeconds: 91800 },
        ],
      });
      expect(timetable.assignments[0].dateRanges).toEqual([
        { startDate: '2026-01-01', endDate: '2026-01-02' },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('preserves version-3 platform groups and exposes unresolved dates without approving them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-verified-group-artifact-'));
    try {
      const { options } = await fixture(root, true);
      const first = await prepareVerifiedGtfsTimetableArtifact(
        join(root, 'schedule.zip'),
        join(root, 'capture.json'),
        options,
      );
      const { timetable } = verifyScheduledTimetableArtifact(
        first.manifestBytes,
        first.manifestSha256,
        first,
      );
      expect(timetable.patterns[0].pattern.stops[0].platformIds).toEqual([
        'A',
        'C',
      ]);
      expect(first.manifest.mapping.draftSha256).toBe(
        groupedScopedReviewDraftSha256(options.draft),
      );
      for (const decision of options.draft.decisions) {
        if (decision.kind === 'pattern') {
          decision.disposition = 'unresolved';
          delete decision.target;
        }
      }
      const partial = await prepareVerifiedGtfsTimetableArtifact(
        join(root, 'schedule.zip'),
        join(root, 'capture.json'),
        options,
      );
      expect(partial.coverage).toMatchObject({
        sourceTripDateCount: 2,
        assignedTripDateCount: 0,
        missingTripDateCount: 2,
      });
      expect(partial.review.readiness).toBe('unresolved');
      expect(partial.generationEligible).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects stale mapping identity, corrupt captures, missing feed dates and caller-supplied source metadata', async () => {
    const root = await mkdtemp(
      join(tmpdir(), 'gtfs-verified-artifact-errors-'),
    );
    try {
      const run = (options: Awaited<ReturnType<typeof fixture>>['options']) =>
        prepareVerifiedGtfsTimetableArtifact(
          join(root, 'schedule.zip'),
          join(root, 'capture.json'),
          options,
        );
      let input = await fixture(root);
      input.options.draft.identity.canonicalCommit = 'b'.repeat(40);
      await expect(run(input.options)).rejects.toThrow(
        'Draft input identity differs',
      );
      input = await fixture(root);
      await writeFile(join(root, 'schedule.zip'), 'corrupt');
      await expect(run(input.options)).rejects.toThrow('size and SHA-256');
      input = await fixture(root);
      const path = join(root, 'data/station/S.json');
      const station = JSON.parse(await readFile(path, 'utf8'));
      station.layout.platforms[0].label = 'Changed';
      await writeFile(path, JSON.stringify(station));
      await expect(run(input.options)).rejects.toThrow(
        'Draft input identity differs',
      );
      for (const text of [
        'feed_start_date,feed_end_date\n',
        'feed_start_date,feed_end_date\n20260101,\n',
        'feed_start_date,feed_end_date\n20260230,20260301\n',
      ]) {
        input = await fixture(root, false, { 'feed_info.txt': text });
        await expect(run(input.options)).rejects.toThrow();
      }
      input = await fixture(root);
      await expect(
        run({
          ...input.options,
          ...{ feedRange: { startDate: '2000-01-01', endDate: '2099-12-31' } },
        }),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
