import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildScheduleTopologyFingerprint,
  hashBytes,
  type ScheduledTripAssignmentDocument,
  ScheduledTripAssignmentDocumentSchema,
} from '@mrtdown/fs';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { gtfsFixture } from '../__tests__/gtfsFixture.js';
import { runCli } from '../index.js';

const commit = 'a'.repeat(40);
const args = [
  'gtfs',
  'validate-assignments',
  '--file',
  'schedule.zip',
  '--capture',
  'capture.json',
  '--assignments',
  'assignments.json',
  '--canonical-commit',
  commit,
];

async function fixture(root: string, overrides: Record<string, string> = {}) {
  const capture = await gtfsFixture(root, {
    'stops.txt':
      'stop_id,stop_name,stop_code,location_type,parent_station,platform_code\nS,Station,S,1,,\nP,Platform,S,0,S,B / A\n',
    ...overrides,
  });
  const name = { 'en-SG': 'Synthetic', 'zh-Hans': null, ms: null, ta: null };
  const records = {
    operator: { id: 'OP', name, foundedAt: '2000-01-01', url: null },
    line: {
      id: 'L',
      name,
      type: 'lrt',
      color: '#000000',
      startedAt: null,
      platformDoorCount: null,
      trainCarCounts: [1],
      serviceIds: ['SVC'],
      operators: [{ operatorId: 'OP', startedAt: null, endedAt: null }],
    },
    service: {
      id: 'SVC',
      name,
      lineId: 'L',
      revisions: [
        {
          id: 'r1',
          startAt: '2000-01-01',
          endAt: null,
          path: {
            stations: [
              { stationId: 'S', displayCode: 'S' },
              { stationId: 'S', displayCode: 'S' },
            ],
          },
          operatingHours: {
            weekdays: { start: '05:00', end: '01:00' },
            weekends: { start: '05:00', end: '01:00' },
          },
        },
      ],
    },
    station: {
      id: 'S',
      name,
      geo: { latitude: 0, longitude: 0 },
      townId: 'T',
      landmarkIds: [],
      stationCodes: [
        {
          lineId: 'L',
          code: 'S',
          startedAt: '2000-01-01',
          endedAt: null,
          structureType: 'at_grade',
        },
      ],
      layout: {
        platforms: ['A', 'B'].map((id) => ({
          id,
          label: id,
          lineId: 'L',
          lastUpdated: '2026-01-01',
        })),
      },
    },
  };
  for (const [kind, record] of Object.entries(records)) {
    await mkdir(join(root, 'data', kind), { recursive: true });
    await writeFile(
      join(root, 'data', kind, `${record.id}.json`),
      JSON.stringify(record),
    );
  }
  const sourceManifest = Object.fromEntries(
    Object.entries(unzipSync(await readFile(join(root, 'schedule.zip'))))
      .reverse()
      .map(([name, bytes]) => [name, hashBytes(bytes)]),
  );
  const document: ScheduledTripAssignmentDocument = {
    schemaVersion: 1,
    documentKind: 'gtfs-trip-assignments',
    identity: {
      canonicalCommit: commit,
      sourceManifest,
      topology: {
        projectionVersion: 1,
        sha256: (await buildScheduleTopologyFingerprint(join(root, 'data')))
          .sha256,
      },
    },
    assignments: [
      {
        routeMapping: {
          providerRouteId: 'R',
          providerAgencyId: 'A',
          lineId: 'L',
          operatorId: 'OP',
        },
        scope: {
          serviceDates: ['2026-01-02', '2026-01-01'],
          binding: {
            providerTripId: 'T,late',
            pattern: {
              lineId: 'L',
              serviceId: 'SVC',
              revisionId: 'r1',
              destinationStationId: 'S',
              stops: [
                { stationId: 'S', platformIds: ['B', 'A'] },
                { stationId: 'S', platformIds: ['A', 'B'] },
              ],
            },
            occurrences: [
              { providerStopId: 'P', stopSequence: '09007199254740992' },
              { providerStopId: 'P', stopSequence: '9007199254740993' },
            ],
          },
        },
      },
    ],
  };
  await writeFile(join(root, 'assignments.json'), JSON.stringify(document));
  return { document, capture, records };
}

describe('GTFS assignment validation CLI', () => {
  it('writes a reproducible report bound to capture, canonical identity and normalized assignments without altering inputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-assignment-cli-'));
    try {
      const { document, capture } = await fixture(root);
      const files = [
        'schedule.zip',
        'capture.json',
        'assignments.json',
        'data/station/S.json',
      ];
      const expectedInputs = await Promise.all(
        files.map((file) => readFile(join(root, file))),
      );
      const output: string[] = [],
        errors: string[] = [];
      const io = {
        stdout: (text: string) => output.push(text),
        stderr: (text: string) => errors.push(text),
      };
      expect(await runCli(args, io, root)).toBe(0);
      const report = JSON.parse(output[0]);
      expect(report).toMatchObject({
        reportVersion: 1,
        documentKind: 'gtfs-trip-assignment-validation',
        capture,
        identity: document.identity,
        assignmentCount: 1,
        tripCount: 1,
        tripDateCount: 2,
        generationEligible: false,
      });
      expect(report).not.toHaveProperty('coverage');
      const normalized = ScheduledTripAssignmentDocumentSchema.parse(document);
      expect(report.assignmentsSha256).toBe(
        hashBytes(Buffer.from(JSON.stringify(normalized.assignments))),
      );
      expect(
        await Promise.all(files.map((file) => readFile(join(root, file)))),
      ).toEqual(expectedInputs);
      const formatted = JSON.stringify(normalized, null, 2);
      await writeFile(join(root, 'assignments.json'), formatted);
      expectedInputs[2] = Buffer.from(formatted);
      expect(await runCli([...args, '--write', 'report.json'], io, root)).toBe(
        0,
      );
      expect(await readFile(join(root, 'report.json'), 'utf8')).toBe(
        `${output[0]}\n`,
      );
      expect(output).toHaveLength(1);
      expect(errors).toEqual([]);
      expect(
        await Promise.all(files.map((file) => readFile(join(root, file)))),
      ).toEqual(expectedInputs);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('preserves existing output when arguments, capture identity, topology or assignment validation fail', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-assignment-errors-'));
    try {
      await writeFile(join(root, 'report.json'), 'existing report');
      const errors: string[] = [],
        output: string[] = [];
      const io = {
        stdout: (text: string) => output.push(text),
        stderr: (text: string) => errors.push(text),
      };
      const writingArgs = [...args, '--coverage', '--write', 'report.json'];
      await fixture(root);
      expect(await runCli([...writingArgs, '--unexpected'], io, root)).toBe(1);
      expect(errors.at(-1)).toContain('Unexpected GTFS');
      expect(
        await runCli(
          [
            'gtfs',
            'validate-assignments',
            '--file',
            'schedule.zip',
            '--capture',
            'capture.json',
          ],
          io,
          root,
        ),
      ).toBe(1);
      expect(errors.at(-1)).toContain('--assignments');
      const changes: [
        string,
        (input: Awaited<ReturnType<typeof fixture>>) => Promise<void> | void,
      ][] = [
        [
          'canonical commit',
          ({ document }) => {
            document.identity.canonicalCommit = 'b'.repeat(40);
          },
        ],
        [
          'source manifest',
          ({ document }) => {
            document.identity.sourceManifest['trips.txt'] = '0'.repeat(64);
          },
        ],
        [
          'source manifest',
          ({ document }) => {
            document.identity.sourceManifest['extra.txt'] = '0'.repeat(64);
          },
        ],
        [
          'topology fingerprint',
          ({ document }) => {
            document.identity.topology.sha256 = '0'.repeat(64);
          },
        ],
        [
          'topology fingerprint',
          async ({ records }) => {
            await writeFile(
              join(root, 'data/line/L.json'),
              JSON.stringify({
                ...records.line,
                operators: [
                  { ...records.line.operators[0], endedAt: '2026-01-02' },
                ],
              }),
            );
          },
        ],
        [
          'source occurrence 0 differs',
          ({ document }) => {
            document.assignments[0].scope.binding.occurrences[0].stopSequence =
              '9007199254740992';
          },
        ],
        [
          'SHA-256',
          async () => {
            await writeFile(join(root, 'schedule.zip'), 'corrupt');
          },
        ],
        [
          'requires a schedule capture',
          async ({ capture }) => {
            await writeFile(
              join(root, 'capture.json'),
              JSON.stringify({
                ...capture,
                feed_kind: 'trip_updates',
                source:
                  'https://datamall2.mytransport.sg/ltaodataservice/GTFSRealtimeTrainTripUpdates',
              }),
            );
          },
        ],
      ];
      for (const [message, change] of changes) {
        const input = await fixture(root);
        await change(input);
        await writeFile(
          join(root, 'assignments.json'),
          JSON.stringify(input.document),
        );
        expect(await runCli(writingArgs, io, root)).toBe(1);
        expect(errors.at(-1)).toContain(message);
        expect(await readFile(join(root, 'report.json'), 'utf8')).toBe(
          'existing report',
        );
      }
      expect(output).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports exact grouped date gaps with exceptions, and separates complete active coverage from inactive trips and publication', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-assignment-coverage-'));
    try {
      const weekly =
        'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nC,0,0,0,1,1,1,0,20260101,20260103\n';
      const exceptions =
        'service_id,date,exception_type\nC,20260102,2\nC,20260104,1\n';
      const { document } = await fixture(root, {
        'calendar.txt': weekly,
        'calendar_dates.txt': exceptions,
      });
      document.assignments[0].scope.serviceDates = ['2026-01-01'];
      const current = structuredClone(document.assignments[0]);
      current.scope.binding.providerTripId = 'current';
      current.scope.binding.occurrences = [
        { providerStopId: 'P', stopSequence: '1' },
        { providerStopId: 'P', stopSequence: '2' },
      ];
      document.assignments.push(current);
      await writeFile(join(root, 'assignments.json'), JSON.stringify(document));
      const output: string[] = [],
        errors: string[] = [];
      const io = {
        stdout: (text: string) => output.push(text),
        stderr: (text: string) => errors.push(text),
      };
      expect(await runCli([...args, '--coverage'], io, root)).toBe(0);
      const partial = JSON.parse(output[0]);
      expect(partial.coverage).toEqual({
        sourceTripCount: 2,
        inactiveTripCount: 0,
        sourceTripDateCount: 6,
        assignedTripDateCount: 2,
        missingTripDateCount: 4,
        tripDateCoverageComplete: false,
        gaps: [
          {
            providerCalendarId: 'C',
            providerTripIds: ['T,late', 'current'],
            serviceDates: ['2026-01-03', '2026-01-04'],
          },
        ],
      });
      document.assignments.reverse();
      await writeFile(join(root, 'assignments.json'), JSON.stringify(document));
      expect(await runCli([...args, '--coverage'], io, root)).toBe(0);
      expect(JSON.parse(output[1]).coverage).toEqual(partial.coverage);

      const complete = await fixture(root, {
        'calendar.txt': weekly,
        'calendar_dates.txt': `${exceptions}C0,20260101,2\n`,
        'trips.txt':
          'trip_id,route_id,service_id\n"T,late",R,C\ncurrent,R,C0\n',
      });
      complete.document.assignments[0].scope.serviceDates = [
        '2026-01-01',
        '2026-01-03',
        '2026-01-04',
      ];
      await writeFile(
        join(root, 'assignments.json'),
        JSON.stringify(complete.document),
      );
      expect(await runCli([...args, '--coverage'], io, root)).toBe(0);
      expect(JSON.parse(output[2])).toMatchObject({
        generationEligible: false,
        coverage: {
          sourceTripCount: 2,
          inactiveTripCount: 1,
          sourceTripDateCount: 3,
          assignedTripDateCount: 3,
          missingTripDateCount: 0,
          tripDateCoverageComplete: true,
          gaps: [],
        },
      });
      expect(errors).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
