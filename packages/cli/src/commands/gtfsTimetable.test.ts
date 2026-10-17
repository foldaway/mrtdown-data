import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScheduledTimetableSchema } from '@mrtdown/core';
import { hashBytes } from '@mrtdown/fs';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { gtfsFixture } from '../__tests__/gtfsFixture.js';
import { runCli } from '../index.js';

const args = [
  'gtfs',
  'timetable',
  '--file',
  'schedule.zip',
  '--capture',
  'capture.json',
];

describe('GTFS timetable export CLI', () => {
  it('exports validated compact content with verified provenance and a reproducible content hash', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-timetable-'));
    try {
      const capture = await gtfsFixture(root);
      const original = await readFile(join(root, 'schedule.zip'));
      const output: string[] = [];
      const errors: string[] = [];
      const io = {
        stdout: (text: string) => output.push(text),
        stderr: (text: string) => errors.push(text),
      };
      expect(await runCli(args, io, root)).toBe(0);
      expect(errors).toEqual([]);
      expect(output).toHaveLength(1);
      const report = JSON.parse(output[0]);
      expect(report).toMatchObject({
        reportVersion: 1,
        documentKind: 'gtfs-source-timetable',
        capture,
        generationEligible: false,
      });
      expect(report.manifest).toEqual(
        Object.fromEntries(
          Object.entries(unzipSync(original)).map(([name, bytes]) => [
            name,
            hashBytes(bytes),
          ]),
        ),
      );
      expect(ScheduledTimetableSchema.parse(report.timetable)).toEqual(
        report.timetable,
      );
      expect(
        report.timetable.trips.map(
          (trip: { providerTripId: string }) => trip.providerTripId,
        ),
      ).toEqual(['T,late', 'current']);
      expect(report.timetable.trips[0].stopTimes).toMatchObject([
        {
          providerStopId: 'P',
          stopSequence: '09007199254740992',
          departureSeconds: 90000,
          pickupType: 1,
        },
        {
          providerStopId: 'P',
          stopSequence: '9007199254740993',
          departureSeconds: 91800,
        },
      ]);
      expect(report.timetableSha256).toBe(
        hashBytes(Buffer.from(JSON.stringify(report.timetable))),
      );
      expect(
        await runCli([...args, '--write', 'timetable.json'], io, root),
      ).toBe(0);
      const saved = await readFile(join(root, 'timetable.json'), 'utf8');
      expect(saved).toBe(`${output[0]}\n`);
      expect(saved.trimEnd()).not.toContain('\n');
      expect(output).toHaveLength(1);
      expect(await readFile(join(root, 'schedule.zip'))).toEqual(original);
      expect(
        JSON.parse(await readFile(join(root, 'capture.json'), 'utf8')),
      ).toEqual(capture);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps the normalized timetable hash stable when source ordering changes, retaining distinct capture hashes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-timetable-order-'));
    try {
      const reports: string[] = [];
      const io = {
        stdout: (text: string) => reports.push(text),
        stderr: () => {},
      };
      await gtfsFixture(root);
      expect(await runCli(args, io, root)).toBe(0);
      await gtfsFixture(root, {
        'trips.txt': 'trip_id,route_id,service_id\ncurrent,R,C\n"T,late",R,C\n',
        'calendar_dates.txt':
          'service_id,date,exception_type\nC,20260102,1\nC,20260101,1\n',
      });
      expect(await runCli(args, io, root)).toBe(0);
      const [before, after] = reports.map((text) => JSON.parse(text));
      expect(after.timetable).toEqual(before.timetable);
      expect(after.timetableSha256).toBe(before.timetableSha256);
      expect(after.capture.sha256).not.toBe(before.capture.sha256);
      expect(after.manifest['trips.txt']).not.toBe(
        before.manifest['trips.txt'],
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('leaves existing output untouched on argument, capture-kind, integrity or schedule failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-timetable-errors-'));
    try {
      const capture = await gtfsFixture(root);
      const file = join(root, 'timetable.json');
      await writeFile(file, 'existing timetable');
      const errors: string[] = [];
      const output: string[] = [];
      const io = {
        stdout: (text: string) => output.push(text),
        stderr: (text: string) => errors.push(text),
      };
      const writingArgs = [...args, '--write', 'timetable.json'];
      expect(
        await runCli([...writingArgs, '--trip', 'current'], io, root),
      ).toBe(1);
      expect(errors.at(-1)).toContain('Unexpected GTFS arguments');
      expect(
        await runCli(['gtfs', 'timetable', '--file', 'schedule.zip'], io, root),
      ).toBe(1);
      expect(errors.at(-1)).toContain('--capture');
      await writeFile(
        join(root, 'capture.json'),
        JSON.stringify({
          ...capture,
          feed_kind: 'trip_updates',
          source:
            'https://datamall2.mytransport.sg/ltaodataservice/GTFSRealtimeTrainTripUpdates',
        }),
      );
      expect(await runCli(writingArgs, io, root)).toBe(1);
      expect(errors.at(-1)).toContain('requires a schedule capture');
      await gtfsFixture(root);
      await writeFile(join(root, 'schedule.zip'), 'corrupt capture');
      expect(await runCli(writingArgs, io, root)).toBe(1);
      expect(errors.at(-1)).toContain('SHA-256');
      await gtfsFixture(root, {
        'calendar_dates.txt': 'service_id,date,exception_type\nC,20260230,1\n',
      });
      expect(await runCli(writingArgs, io, root)).toBe(1);
      expect(await readFile(file, 'utf8')).toBe('existing timetable');
      expect(output).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
