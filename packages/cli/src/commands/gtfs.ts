import { resolve } from 'node:path';
import {
  buildScheduleTopologyFingerprint,
  inspectGtfsCapture,
  inspectGtfsDepartures,
  inspectGtfsDirectory,
} from '@mrtdown/fs';
import { readOption } from '../args.js';
import type { CliIO, GlobalOptions } from '../types.js';
import { writeTextFile } from './manifest.js';

function readRepeatedOption(
  args: string[],
  name: string,
  required = true,
): string[] {
  const values: string[] = [];
  let value = readOption(args, name, { required });
  while (value !== undefined) {
    values.push(value);
    value = readOption(args, name);
  }
  return values;
}

export async function runGtfs(
  args: string[],
  globals: GlobalOptions,
  io: CliIO,
): Promise<number> {
  const command = args.shift();
  const output = readOption(args, '--write');
  let report: unknown;
  let exitCode = 0;
  if (command === 'inspect') {
    const directory = readOption(args, '--directory');
    const manifest = readOption(args, '--manifest', { required: !!directory });
    const file = readOption(args, '--file', { required: !directory });
    const handoff = readOption(args, '--capture', { required: !directory });
    if ((directory && (file || handoff)) || (!directory && manifest)) {
      throw new Error(
        'Use --directory with --manifest or --file with --capture',
      );
    }
    if (args.length)
      throw new Error(`Unexpected GTFS arguments: ${args.join(' ')}`);
    const result = directory
      ? await inspectGtfsDirectory(
          resolve(globals.cwd, directory),
          resolve(globals.cwd, manifest ?? ''),
        )
      : await inspectGtfsCapture(
          resolve(globals.cwd, file ?? ''),
          resolve(globals.cwd, handoff ?? ''),
        );
    report = result;
    if (result.schedule?.structuralErrors.length) exitCode = 1;
  } else if (command === 'departures') {
    const file = readOption(args, '--file', { required: true });
    const capture = readOption(args, '--capture', { required: true });
    const tripIds = readRepeatedOption(args, '--trip', false);
    const stopIds = readRepeatedOption(args, '--stop', false);
    if (!tripIds.length && !stopIds.length) {
      throw new Error('Provide --trip or --stop');
    }
    if (tripIds.length && stopIds.length) {
      throw new Error('Use --trip or --stop, not both');
    }
    const serviceDates = readRepeatedOption(args, '--service-date');
    const startInstant = readOption(args, '--from', { required: true });
    const endInstant = readOption(args, '--to', { required: true });
    if (args.length) {
      throw new Error(`Unexpected GTFS arguments: ${args.join(' ')}`);
    }
    report = await inspectGtfsDepartures(
      resolve(globals.cwd, file ?? ''),
      resolve(globals.cwd, capture ?? ''),
      {
        ...(tripIds.length ? { tripIds } : { stopIds }),
        serviceDates,
        startInstant: startInstant ?? '',
        endInstant: endInstant ?? '',
      },
    );
  } else if (command === 'topology') {
    if (args.length)
      throw new Error(`Unexpected GTFS arguments: ${args.join(' ')}`);
    report = await buildScheduleTopologyFingerprint(globals.dataDir);
  } else {
    throw new Error('Expected gtfs inspect, gtfs departures or gtfs topology');
  }
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (output) await writeTextFile(resolve(globals.cwd, output), json);
  else io.stdout(json.trimEnd());
  return exitCode;
}
