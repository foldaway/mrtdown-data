import { DateTime } from 'luxon';
import { IdGenerator } from '@mrtdown/fs';

function parseDateTime(ts?: string) {
  if (ts == null) {
    return DateTime.now();
  }

  const dateTime = DateTime.fromISO(ts);
  if (!dateTime.isValid) {
    return null;
  }
  return dateTime;
}

export function runGenerateEvidenceId(args: {
  ts?: string;
  json?: boolean;
}): number {
  const dateTime = parseDateTime(args.ts);
  if (dateTime == null) {
    console.error('Invalid --ts value. Use an ISO-8601 timestamp.');
    return 1;
  }

  const id = IdGenerator.evidenceId(dateTime);
  if (args.json) {
    console.log(
      JSON.stringify(
        {
          id,
          kind: 'evidence',
          timestamp: dateTime.toISO({ includeOffset: true }),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log(id);
  return 0;
}

export function runGenerateImpactId(args: {
  ts?: string;
  json?: boolean;
}): number {
  const dateTime = parseDateTime(args.ts);
  if (dateTime == null) {
    console.error('Invalid --ts value. Use an ISO-8601 timestamp.');
    return 1;
  }

  const id = IdGenerator.impactEventId(dateTime);
  if (args.json) {
    console.log(
      JSON.stringify(
        {
          id,
          kind: 'impact-event',
          timestamp: dateTime.toISO({ includeOffset: true }),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log(id);
  return 0;
}

export function runInspectId(
  id: string,
  args: {
    json?: boolean;
  },
): number {
  const info = IdGenerator.inspect(id);
  if (info == null) {
    console.error('ID is not a recognized generated evidence or impact-event ID.');
    return 1;
  }

  const timestamp = DateTime.fromMillis(info.timestampMs, {
    zone: 'utc',
  }).toISO({ includeOffset: true });

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          ...info,
          timestamp,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log(`id: ${info.id}`);
  console.log(`kind: ${info.kind}`);
  console.log(`ulid: ${info.ulid}`);
  console.log(`timestamp: ${timestamp}`);
  return 0;
}
