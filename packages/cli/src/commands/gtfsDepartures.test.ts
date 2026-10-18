import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gtfsFixture as fixture } from '../__tests__/gtfsFixture.js';
import { runCli } from '../index.js';

function queryArgs(
  tripIds = ['T,late', 'current'],
  serviceDates = ['2026-01-02', '2026-01-01'],
) {
  return [
    'gtfs',
    'departures',
    '--file',
    'schedule.zip',
    '--capture',
    'capture.json',
    ...tripIds.flatMap((id) => ['--trip', id]),
    ...serviceDates.flatMap((date) => ['--service-date', date]),
    '--from',
    '2026-01-02T00:30:00+08:00',
    '--to',
    '2026-01-01T17:30:00Z',
    '--write',
    'report.json',
  ];
}
const args = queryArgs();

function stopQueryArgs(stopIds: string[], serviceDates?: string[]) {
  return [
    ...queryArgs([], serviceDates),
    ...stopIds.flatMap((id) => ['--stop', id]),
  ];
}

describe('GTFS departure inspection CLI', () => {
  it('writes a deterministic, source-bound report across trips and dates with literal provider IDs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-departures-'));
    try {
      const capture = await fixture(root);
      const errors: string[] = [];
      const io = {
        stdout: () => {},
        stderr: (text: string) => errors.push(text),
      };
      expect(await runCli(args, io, root)).toBe(0);
      expect(errors).toEqual([]);
      const first = await readFile(join(root, 'report.json'), 'utf8');
      const report = JSON.parse(first);
      expect(report).toMatchObject({
        documentKind: 'gtfs-source-departures',
        capture,
        generationEligible: false,
        query: {
          tripIds: ['T,late', 'current'],
          serviceDates: ['2026-01-01', '2026-01-02'],
        },
      });
      expect(
        report.departures.map((stop: Record<string, string>) => [
          stop.providerTripId,
          stop.serviceDate,
          stop.stopSequence,
          stop.departureInstant,
        ]),
      ).toEqual([
        ['current', '2026-01-02', '1', '2026-01-01T16:30:00Z'],
        ['T,late', '2026-01-01', '09007199254740992', '2026-01-01T17:00:00Z'],
        ['current', '2026-01-02', '2', '2026-01-01T17:00:00Z'],
      ]);
      expect(report.departures[0].timepoint).toBe(0);
      expect(report.departures[1].pickupType).toBe(1);
      const reordered = queryArgs(
        ['current', 'T,late'],
        ['2026-01-01', '2026-01-02'],
      );
      expect(await runCli(reordered, io, root)).toBe(0);
      expect(await readFile(join(root, 'report.json'), 'utf8')).toBe(first);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('leaves an existing report untouched when arguments, requested trips or capture verification fail', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-departure-errors-'));
    try {
      await fixture(root);
      const output = join(root, 'report.json');
      await writeFile(output, 'existing report');
      const errors: string[] = [];
      const io = {
        stdout: () => {},
        stderr: (text: string) => errors.push(text),
      };
      expect(await runCli([...args, '--unexpected'], io, root)).toBe(1);
      expect(errors.at(-1)).toContain('Unexpected GTFS');
      expect(
        await runCli(
          [
            'gtfs',
            'departures',
            '--file',
            'schedule.zip',
            '--capture',
            'capture.json',
          ],
          io,
          root,
        ),
      ).toBe(1);
      expect(errors.at(-1)).toContain('Provide --trip or --stop');
      expect(await runCli([...args, '--stop', 'P'], io, root)).toBe(1);
      expect(errors.at(-1)).toContain('not both');
      expect(await runCli(stopQueryArgs(['unknown']), io, root)).toBe(1);
      expect(errors.at(-1)).toContain('Unknown GTFS stop');
      for (const id of ['S', 'E']) {
        expect(await runCli(stopQueryArgs([id]), io, root)).toBe(1);
        expect(errors.at(-1)).toContain('not a stop/platform');
      }
      const unknown = queryArgs(['unknown']);
      expect(await runCli(unknown, io, root)).toBe(1);
      expect(errors.at(-1)).toContain('Unknown GTFS trip: unknown');
      await fixture(root, {
        'agency.txt':
          'agency_id,agency_name,agency_url,agency_timezone\nA,Test,https://example.com,Europe/London\n',
      });
      expect(await runCli(args, io, root)).toBe(1);
      expect(errors.at(-1)).toContain('Asia/Singapore');
      await fixture(root, {
        'frequencies.txt':
          'trip_id,start_time,end_time,headway_secs\ncurrent,00:00:00,02:00:00,300\n',
      });
      expect(await runCli(args, io, root)).toBe(1);
      expect(errors.at(-1)).toContain('frequency-based trips');
      expect(await runCli(stopQueryArgs(['P']), io, root)).toBe(1);
      expect(errors.at(-1)).toContain('frequency-based trips');
      await fixture(root);
      await writeFile(join(root, 'schedule.zip'), 'corrupt capture');
      expect(await runCli(args, io, root)).toBe(1);
      expect(errors.at(-1)).toContain('SHA-256');
      expect(await readFile(output, 'utf8')).toBe('existing report');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('finds trips by stop, filters other visits and preserves repeated occurrences', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-stop-departures-'));
    try {
      await fixture(root, {
        'stop_times.txt': [
          'trip_id,stop_id,stop_sequence,arrival_time,departure_time,pickup_type,timepoint',
          '"T,late",P,09007199254740992,25:00:00,25:00:00,1,1',
          '"T,late",Q,9007199254740993,25:10:00,25:10:00,0,1',
          '"T,late",P,9007199254740994,25:20:00,25:20:00,0,0',
          'current,P,1,0:30:00,0:30:00,0,1',
          'current,Q,2,1:00:00,1:00:00,0,1',
          '',
        ].join('\n'),
      });
      const errors: string[] = [];
      const io = {
        stdout: () => {},
        stderr: (text: string) => errors.push(text),
      };
      expect(await runCli(stopQueryArgs(['P']), io, root)).toBe(0);
      const report = JSON.parse(
        await readFile(join(root, 'report.json'), 'utf8'),
      );
      expect(report.query.stopIds).toEqual(['P']);
      expect(report.query.tripIds).toBeUndefined();
      expect(report.generationEligible).toBe(false);
      expect(
        report.departures.map((stop: Record<string, string>) => [
          stop.providerTripId,
          stop.providerStopId,
          stop.stopSequence,
        ]),
      ).toEqual([
        ['current', 'P', '1'],
        ['T,late', 'P', '09007199254740992'],
        ['T,late', 'P', '9007199254740994'],
      ]);
      expect(report.departures[1].pickupType).toBe(1);
      expect(report.departures[2].timepoint).toBe(0);
      expect(await runCli(stopQueryArgs(['Q', 'P']), io, root)).toBe(0);
      const combined = await readFile(join(root, 'report.json'), 'utf8');
      expect(JSON.parse(combined).departures).toHaveLength(5);
      expect(await runCli(stopQueryArgs(['P', 'Q']), io, root)).toBe(0);
      expect(await readFile(join(root, 'report.json'), 'utf8')).toBe(combined);
      expect(errors).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports no departures at an unused platform while still validating dates and duplicate selectors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-unused-stop-'));
    try {
      await fixture(root);
      const io = { stdout: () => {}, stderr: () => {} };
      expect(await runCli(stopQueryArgs(['UNUSED']), io, root)).toBe(0);
      const output = join(root, 'report.json');
      expect(JSON.parse(await readFile(output, 'utf8')).departures).toEqual([]);
      expect(await runCli(stopQueryArgs(['UNUSED'], []), io, root)).toBe(0);
      const report = await readFile(output, 'utf8');
      expect(JSON.parse(report).query).toMatchObject({
        serviceDates: [],
        serviceDateSelection: 'automatic',
      });
      expect(
        await runCli(stopQueryArgs(['UNUSED'], ['not-a-date']), io, root),
      ).toBe(1);
      expect(
        await runCli(
          stopQueryArgs(['UNUSED'], ['2026-01-01', '2026-01-01']),
          io,
          root,
        ),
      ).toBe(1);
      expect(await runCli(stopQueryArgs(['UNUSED', 'UNUSED']), io, root)).toBe(
        1,
      );
      expect(await readFile(output, 'utf8')).toBe(report);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('chooses dates automatically for trip and stop queries while retaining an explicit override', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-auto-dates-'));
    try {
      await fixture(root);
      const errors: string[] = [];
      const io = {
        stdout: () => {},
        stderr: (text: string) => errors.push(text),
      };
      const output = join(root, 'report.json');
      expect(await runCli(queryArgs(), io, root)).toBe(0);
      const explicit = JSON.parse(await readFile(output, 'utf8'));
      expect(await runCli(queryArgs(['T,late', 'current'], []), io, root)).toBe(
        0,
      );
      const automatic = JSON.parse(await readFile(output, 'utf8'));
      expect(automatic.query).toMatchObject({
        serviceDates: ['2026-01-01', '2026-01-02'],
        serviceDateSelection: 'automatic',
      });
      expect(automatic.departures).toEqual(explicit.departures);
      expect(await runCli(stopQueryArgs(['P'], []), io, root)).toBe(0);
      expect(JSON.parse(await readFile(output, 'utf8')).departures).toEqual(
        explicit.departures,
      );
      expect(
        await runCli(
          queryArgs(['T,late', 'current'], ['2026-01-02']),
          io,
          root,
        ),
      ).toBe(0);
      expect(
        JSON.parse(await readFile(output, 'utf8')).departures,
      ).toHaveLength(2);
      await fixture(root, {
        'calendar_dates.txt':
          'service_id,date,exception_type\nC,20260101,1\nC,20260102,2\n',
      });
      expect(await runCli(stopQueryArgs(['P'], []), io, root)).toBe(0);
      const removed = JSON.parse(await readFile(output, 'utf8'));
      expect(removed.query.serviceDates).toEqual(['2026-01-01']);
      expect(
        removed.departures.map((stop: Record<string, string>) => [
          stop.providerTripId,
          stop.serviceDate,
        ]),
      ).toEqual([['T,late', '2026-01-01']]);
      expect(errors).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
