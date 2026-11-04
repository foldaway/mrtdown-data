import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type PublicHolidayCalendar,
  PublicHolidayCalendarSchema,
} from '@mrtdown/core';
import z from 'zod';
import { entityPath, writeEntity } from './entities.js';
import { hashBytes } from './gtfs/capture.js';

export const singaporePublicHolidaysDatasetId =
  'd_8ef23381f9417e4d4254ee8b4dcdb176';
export const singaporePublicHolidaysDatasetUrl = `https://data.gov.sg/datasets/${singaporePublicHolidaysDatasetId}/view`;
export const singaporePublicHolidaysApiUrl = `https://data.gov.sg/api/action/datastore_search?resource_id=${singaporePublicHolidaysDatasetId}&limit=500`;

const responseSchema = z.object({
  success: z.literal(true),
  result: z.object({
    resource_id: z.literal(singaporePublicHolidaysDatasetId),
    total: z.number().int().positive(),
    records: z.array(z.record(z.string(), z.unknown())).min(1),
  }),
});

/** Import a complete official capture; fetching and applying canonical writes are separate. */
export function publicHolidayCalendarsFromDataGov(
  bytes: Uint8Array,
  input: { checkedOn: string; datasetUpdatedOn: string },
) {
  const checkedOn = z.iso.date().parse(input.checkedOn);
  const datasetUpdatedOn = z.iso.date().parse(input.datasetUpdatedOn);
  if (checkedOn < datasetUpdatedOn) {
    throw new Error('Holiday capture check date precedes the dataset update');
  }
  const response = responseSchema.parse(
    JSON.parse(Buffer.from(bytes).toString('utf8')),
  );
  if (response.result.total !== response.result.records.length) {
    throw new Error(
      'Public-holiday import requires the complete consolidated dataset',
    );
  }
  const dates = response.result.records.map((row) => {
    const date = z.iso.date().parse(row.date ?? row.Date);
    const name = z
      .string()
      .trim()
      .min(1)
      .parse(row.holiday ?? row.Holiday);
    return { date, name, observed: name.endsWith(' (Observed)') };
  });
  if (new Set(dates.map(({ date }) => date)).size !== dates.length) {
    throw new Error('Duplicate public-holiday date in consolidated dataset');
  }
  const source = {
    publisher: 'Singapore Ministry of Manpower',
    datasetId: singaporePublicHolidaysDatasetId,
    datasetUrl: singaporePublicHolidaysDatasetUrl,
    datasetUpdatedOn,
    licenceUrl: 'https://data.gov.sg/open-data-licence',
    retrievedUrl: singaporePublicHolidaysApiUrl,
    retrievedBytesSha256: hashBytes(bytes),
    retrievedByteLength: bytes.length,
    retrievedRecordCount: dates.length,
  };
  return [...new Set(dates.map(({ date }) => date.slice(0, 4)))]
    .sort()
    .map((year) => {
      const yearDates = dates.filter(({ date }) => date.startsWith(`${year}-`));
      return PublicHolidayCalendarSchema.parse({
        id: `SG-${year}`,
        countryCode: 'SG',
        schemaVersion: 1,
        revision: `mom-sg-public-holidays-${year}-${checkedOn}`,
        checkedOn,
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
        source: { ...source, recordCount: yearDates.length },
        dates: yearDates,
      });
    });
}

/** Stage all years before replacing files. Final renames are per file, not a transaction. */
export async function applyPublicHolidayCalendars(
  dataDir: string,
  calendars: readonly PublicHolidayCalendar[],
) {
  if (
    new Set(calendars.map((calendar) => calendar.id)).size !== calendars.length
  ) {
    throw new Error('Duplicate public-holiday calendar ID');
  }
  await mkdir(dataDir, { recursive: true });
  const staging = await mkdtemp(join(dataDir, '.public-holiday-import-'));
  try {
    for (const calendar of calendars) {
      await writeEntity(staging, 'public-holiday', calendar);
    }
    await mkdir(join(dataDir, 'public-holiday'), { recursive: true });
    for (const calendar of calendars) {
      await rename(
        entityPath(staging, 'public-holiday', calendar.id),
        entityPath(dataDir, 'public-holiday', calendar.id),
      );
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
