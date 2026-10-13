import { resolve } from 'node:path';
import {
  buildScheduleTopologyFingerprint,
  inspectGtfsCapture,
} from '@mrtdown/fs';
import { readOption } from '../args.js';
import type { CliIO, GlobalOptions } from '../types.js';
import { writeTextFile } from './manifest.js';

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
    const file = readOption(args, '--file', { required: true });
    const handoff = readOption(args, '--capture', { required: true });
    if (args.length)
      throw new Error(`Unexpected GTFS arguments: ${args.join(' ')}`);
    const result = await inspectGtfsCapture(
      resolve(globals.cwd, file ?? ''),
      resolve(globals.cwd, handoff ?? ''),
    );
    report = result;
    if (result.schedule?.structuralErrors.length) exitCode = 1;
  } else if (command === 'topology') {
    if (args.length)
      throw new Error(`Unexpected GTFS arguments: ${args.join(' ')}`);
    report = await buildScheduleTopologyFingerprint(globals.dataDir);
  } else {
    throw new Error('Expected gtfs inspect or gtfs topology');
  }
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (output) await writeTextFile(resolve(globals.cwd, output), json);
  else io.stdout(json.trimEnd());
  return exitCode;
}
