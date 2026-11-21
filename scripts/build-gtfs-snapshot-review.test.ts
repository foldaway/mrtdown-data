import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, expect, test } from 'vitest';
import { hashBytes } from '../packages/fs/src/gtfs/capture.js';
import {
  buildSnapshotReview,
  compareCoverage,
  independentFindings,
  serviceCoverage,
  validateBaseline,
} from './build-gtfs-snapshot-review.mjs';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

function tables() {
  return {
    'agency.txt': [
      {
        agency_id: 'A',
        agency_name: 'A',
        agency_url: 'https://example.com',
        agency_timezone: 'Asia/Singapore',
      },
    ],
    'routes.txt': [{ route_id: 'R', agency_id: 'A', route_type: '1' }],
    'stops.txt': [{ stop_id: 'S', stop_name: 'Station' }],
    'trips.txt': [{ route_id: 'R', service_id: 'C', trip_id: 'T' }],
    'stop_times.txt': [
      {
        trip_id: 'T',
        arrival_time: '24:10:00',
        departure_time: '24:10:00',
        stop_id: 'S',
        stop_sequence: '1',
      },
      {
        trip_id: 'T',
        arrival_time: '24:20:00',
        departure_time: '24:20:00',
        stop_id: 'S',
        stop_sequence: '2',
      },
    ],
    'calendar.txt': [
      {
        service_id: 'C',
        monday: '1',
        tuesday: '1',
        wednesday: '1',
        thursday: '1',
        friday: '1',
        saturday: '0',
        sunday: '0',
        start_date: '20261119',
        end_date: '20261123',
      },
    ],
    'calendar_dates.txt': [
      { service_id: 'C', date: '20261120', exception_type: '2' },
      { service_id: 'C', date: '20261121', exception_type: '1' },
    ],
  };
}
type Tables = ReturnType<typeof tables>;
async function fixture(directory: string, data: Tables) {
  await mkdir(directory, { recursive: true });
  const bytes = zipSync(
    Object.fromEntries(
      Object.entries(data).map(([name, rows]) => {
        const columns = Object.keys(rows[0]);
        return [
          name,
          strToU8(
            `${columns.join(',')}\n${rows.map((row) => columns.map((key) => row[key as keyof typeof row]).join(',')).join('\n')}\n`,
          ),
        ];
      }),
    ),
    { mtime: new Date('2000-01-01T00:00:00Z') },
  );
  const sha256 = hashBytes(bytes);
  const file = join(directory, 'schedule.zip');
  const handoff = join(directory, 'capture.json');
  await writeFile(file, bytes);
  await writeFile(
    handoff,
    JSON.stringify({
      schema_version: 1,
      capture_id: 'test',
      feed_kind: 'schedule',
      source:
        'https://datamall2.mytransport.sg/ltaodataservice/GTFSScheduleTrain',
      retrieved_at: '2026-11-19T20:00:00Z',
      provider_timestamp: null,
      sha256,
      byte_length: bytes.length,
      archive_ref: `blobs/schedule/${sha256}.zip`,
      attribution: 'Synthetic fixture',
      rights_status: 'redistribution_permitted',
      licence_reference: 'https://example.com',
    }),
  );
  return { file, handoff, sha256 };
}
async function setup(before = tables(), after = tables()) {
  const root = await mkdtemp(join(tmpdir(), 'gtfs-review-'));
  directories.push(root);
  const previous = await fixture(join(root, 'before'), before);
  const current = await fixture(join(root, 'after'), after);
  const baselinePath = join(root, 'baseline.json');
  await writeFile(
    baselinePath,
    JSON.stringify({
      schemaVersion: 1,
      captureKey: `captures/schedule/${previous.sha256}.json`,
      evidence: { description: 'Test baseline' },
    }),
  );
  return {
    root,
    current,
    options: {
      inputDir: join(root, 'after'),
      independentDir: join(root, 'validator'),
      outputDir: join(root, 'output'),
      baselinePath,
      origin: 'https://sources.example.com',
      canonicalCommit: 'a'.repeat(40),
      independentOutcome: 'failure',
      inspectionOutcome: 'success',
      acquire: async () => previous,
    },
  };
}

test('coverage applies exceptions, excludes unused calendars and retains service dates for overnight events', () => {
  const data = tables();
  data['calendar.txt'].push({
    ...data['calendar.txt'][0],
    service_id: 'unused',
    end_date: '20261231',
  });
  const coverage = serviceCoverage(data);
  expect(coverage.dates).toEqual(['2026-11-19', '2026-11-21', '2026-11-23']);
  const next = structuredClone(data);
  next['calendar_dates.txt'][0].exception_type = '1';
  expect(compareCoverage(coverage, serviceCoverage(next))).toMatchObject({
    added: {
      count: 1,
      ranges: [{ startDate: '2026-11-20', endDate: '2026-11-20' }],
    },
    removed: { count: 0 },
    shared: { count: 3 },
    services: expect.arrayContaining([
      {
        serviceId: 'C',
        added: {
          count: 1,
          ranges: [{ startDate: '2026-11-20', endDate: '2026-11-20' }],
        },
        removed: { count: 0, ranges: [] },
      },
    ]),
  });
});

test('reordered rows compare identically and provider renumbering is described without claiming new services', async () => {
  const before = tables();
  const after = tables();
  after['stop_times.txt'].reverse();
  const { options, current } = await setup(before, after);
  const report = await buildSnapshotReview(options);
  expect(report.comparison.status).toBe('available');
  expect(
    report.comparison.drift.tables.every(
      (table: { added: number; removed: number; changed: number }) =>
        !table.added && !table.removed && !table.changed,
    ),
  ).toBe(true);
  const markdown = await readFile(
    join(options.outputDir, `${current.sha256}.md`),
    'utf8',
  );
  expect(markdown).toContain('No normalized table content changes');
  expect(markdown).toContain('Independent findings unavailable');
  expect(markdown).toContain('do not establish added/removed train services');
  expect(markdown).toContain('does not accept a baseline');
  expect(
    await buildSnapshotReview({
      ...options,
      outputDir: join(options.outputDir, '..', 'replay'),
    }),
  ).toEqual(report);
  await expect(buildSnapshotReview(options)).rejects.toThrow('EEXIST');

  after['trips.txt'][0].trip_id = 'renumbered';
  for (const row of after['stop_times.txt']) row.trip_id = 'renumbered';
  const renamed = await setup(before, after);
  const changed = await buildSnapshotReview(renamed.options);
  expect(
    changed.comparison.drift.tables.find(
      (table: { name: string }) => table.name === 'trips.txt',
    ),
  ).toMatchObject({ added: 1, removed: 1 });
  expect(changed.comparison.coverage.added.count).toBe(0);
});

test('unavailable baselines and invalid candidates still produce review evidence, never an empty successful diff', async () => {
  const { options, current } = await setup();
  const unavailable = await buildSnapshotReview({
    ...options,
    acquire: async () => {
      throw new Error('Baseline unavailable');
    },
  });
  expect(unavailable.comparison).toEqual({
    status: 'unavailable',
    reason: 'Baseline unavailable',
  });
  expect(
    await readFile(join(options.outputDir, `${current.sha256}.md`), 'utf8'),
  ).toContain('**Comparison unavailable:**');
  const invalid = tables();
  invalid['trips.txt'][0].route_id = 'unknown';
  const bad = await setup(tables(), invalid);
  const report = await buildSnapshotReview(bad.options);
  expect(report.comparison.status).toBe('unavailable');
  expect(report.current.structuralErrors).toContain(
    'trip T: unknown route unknown',
  );
});

test('rejects tampered captures and malformed baseline keys', async () => {
  const { options, current } = await setup();
  await writeFile(current.file, 'tampered');
  await expect(buildSnapshotReview(options)).rejects.toThrow('SHA-256');
  expect(() =>
    validateBaseline({
      schemaVersion: 1,
      captureKey: '../untrusted',
      evidence: { description: 'test' },
    }),
  ).toThrow('baseline');
});

test.each([
  { captureKey: [`captures/schedule/${'a'.repeat(64)}.json`] },
  { captureKey: null },
  { captureKey: 42 },
])('non-string baseline keys retain an unavailable-comparison report: %j', async ({
  captureKey,
}) => {
  const { options, current } = await setup();
  await writeFile(
    options.baselinePath,
    JSON.stringify({
      schemaVersion: 1,
      captureKey,
      evidence: { description: 'Malformed baseline' },
    }),
  );
  const report = await buildSnapshotReview(options);
  expect(report.comparison).toEqual({
    status: 'unavailable',
    reason: 'Invalid explicit GTFS comparison baseline',
  });
  expect(
    await readFile(join(options.outputDir, `${current.sha256}.md`), 'utf8'),
  ).toContain('**Comparison unavailable:**');
  expect(
    JSON.parse(
      await readFile(join(options.outputDir, `${current.sha256}.json`), 'utf8'),
    ).comparison.status,
  ).toBe('unavailable');
});

test('retains warning counts and bounded examples, escaping feed text and verifying validator provenance', async () => {
  const { options, current } = await setup();
  await mkdir(options.independentDir);
  await writeFile(
    join(options.independentDir, 'invocation.json'),
    JSON.stringify({
      inputSha256: current.sha256,
      stage: 'complete',
      validator: { version: 'test' },
      executionError: null,
    }),
  );
  await writeFile(
    join(options.independentDir, 'report.json'),
    JSON.stringify({
      notices: [
        {
          code: '<script>|[bad](url)',
          severity: 'WARNING',
          totalNotices: 123,
          sampleNotices: [{ trip: 'T' }],
        },
      ],
    }),
  );
  await writeFile(
    join(options.independentDir, 'system_errors.json'),
    JSON.stringify({ notices: [] }),
  );
  const report = await buildSnapshotReview(options);
  expect(report.validation).toMatchObject({
    status: 'available',
    totals: { WARNING: 123 },
  });
  expect(
    await readFile(join(options.outputDir, `${current.sha256}.md`), 'utf8'),
  ).toContain('&#60;script&#62;&#124;&#91;bad&#93;');
  expect(
    (
      await independentFindings(
        options.independentDir,
        '0'.repeat(64),
        'success',
      )
    ).status,
  ).toBe('unavailable');
});
