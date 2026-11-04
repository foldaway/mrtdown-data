import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type PublicHolidayCalendar,
  PublicHolidayCalendarSchema,
} from '@mrtdown/core';
import { expect, it } from 'vitest';
import { listEntityIds, readEntity, writeUnknownEntity } from './entities.js';
import { hashBytes } from './gtfs/capture.js';
import { buildManifest } from './manifest.js';
import { renderPagesIndex } from './pagesIndex.js';
import {
  publicHolidayCalendarsFromDataGov,
  singaporePublicHolidaysDatasetId,
} from './publicHolidays.js';
import { FileStore } from './repo/common/FileStore.js';
import { MRTDownRepository } from './repo/MRTDownRepository.js';
import { validateDataRoot } from './validate.js';
import { FileWriteStore } from './write/common/FileWriteStore.js';
import { MRTDownWriter } from './write/MRTDownWriter.js';

it('roundtrips a shared holiday year, validates it and lists it in public exports', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-public-holidays-'));
  try {
    const olderRepository = new MRTDownRepository({
      store: new FileStore(dataDir),
    });
    expect(olderRepository.publicHolidays.get('SG-2026')).toBeNull();
    expect(olderRepository.publicHolidays.list()).toEqual([]);
    const calendar: PublicHolidayCalendar = PublicHolidayCalendarSchema.parse({
      id: 'SG-2026',
      countryCode: 'SG',
      schemaVersion: 1,
      revision: 'synthetic-2026-v1',
      checkedOn: '2026-11-03',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      source: {
        publisher: 'Synthetic test publisher',
        datasetId: 'synthetic-holidays',
        datasetUrl: 'https://example.com/holidays',
        datasetUpdatedOn: '2026-01-01',
        licenceUrl: 'https://example.com/licence',
        retrievedUrl: 'https://example.com/holidays.csv',
        retrievedBytesSha256: 'a'.repeat(64),
        retrievedByteLength: 100,
        retrievedRecordCount: 2,
        recordCount: 2,
      },
      dates: [
        { date: '2026-11-08', name: 'Sunday holiday', observed: false },
        { date: '2026-11-09', name: 'Observed holiday', observed: true },
      ],
    });
    const writer = new MRTDownWriter({ store: new FileWriteStore(dataDir) });
    writer.publicHolidays.create(calendar);
    expect(await listEntityIds(dataDir, 'public-holiday')).toEqual(['SG-2026']);
    expect(
      (await readEntity(dataDir, 'public-holiday', 'SG-2026')).value,
    ).toEqual(calendar);
    const repository = new MRTDownRepository({ store: new FileStore(dataDir) });
    expect(repository.publicHolidays.get('SG-2026')).toEqual(calendar);
    expect(repository.publicHolidays.list()).toEqual([calendar]);
    const validation = await validateDataRoot(dataDir, ['public-holiday']);
    expect(validation.ok).toBe(true);
    expect(validation.checked['public-holiday']).toBe(1);

    await mkdir(join(dataDir, 'rights'));
    await writeFile(
      join(dataDir, 'rights', 'source-registry.json'),
      JSON.stringify({
        schemaVersion: 1,
        rights: [
          {
            id: 'test',
            label: 'Test rights',
            url: null,
            category: 'mrtdown-authored',
            summary: 'Synthetic test rights.',
          },
        ],
        rules: [
          {
            id: 'test',
            label: 'Test rule',
            match: { sourceUrlHost: ['example.com'] },
            category: 'mrtdown-authored',
            contentRights: 'test',
            mrtdownRights: 'test',
            policy: 'mrtdown-authored-public-data',
            attributionTemplate: 'Test',
            publicExportAllowed: true,
          },
        ],
      }),
    );
    const manifest = await buildManifest(dataDir, '2026-11-03T00:00:00Z');
    expect(manifest.publicHolidays?.['SG-2026']).toMatch(/^[0-9a-f]{64}$/);
    expect(renderPagesIndex(manifest)).toContain('public-holiday/SG-2026.json');
    const { publicHolidays: _, ...olderManifest } = manifest;
    expect(renderPagesIndex(olderManifest)).not.toContain(
      'public-holiday/SG-2026.json',
    );

    const invalid = {
      ...calendar,
      dates: [...calendar.dates, calendar.dates[0]],
    };
    await expect(
      writeUnknownEntity(dataDir, 'public-holiday', invalid),
    ).rejects.toThrow();
    await writeFile(
      join(dataDir, 'public-holiday', 'SG-2026.json'),
      JSON.stringify(invalid),
    );
    const rejected = await validateDataRoot(dataDir, ['public-holiday']);
    expect(rejected.ok).toBe(false);
    expect(rejected.errors.join(';')).toContain('public-holiday');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

it('imports complete consolidated captures by year and rejects partial or malformed input', () => {
  const response = {
    success: true,
    result: {
      resource_id: singaporePublicHolidaysDatasetId,
      total: 3,
      records: [
        { date: '2026-11-09', holiday: 'Deepavali (Observed)' },
        { date: '2027-01-01', holiday: 'New Year’s Day' },
        { date: '2026-11-08', holiday: 'Deepavali' },
      ],
    },
  };
  const options = { checkedOn: '2026-11-04', datasetUpdatedOn: '2026-07-03' };
  const bytes = Buffer.from(JSON.stringify(response));
  const calendars = publicHolidayCalendarsFromDataGov(bytes, options);
  expect(calendars.map((calendar) => calendar.id)).toEqual([
    'SG-2026',
    'SG-2027',
  ]);
  expect(calendars[0].dates).toEqual([
    { date: '2026-11-08', name: 'Deepavali', observed: false },
    { date: '2026-11-09', name: 'Deepavali (Observed)', observed: true },
  ]);
  expect(calendars[0].source.retrievedBytesSha256).toBe(hashBytes(bytes));
  expect(calendars[0].source.retrievedRecordCount).toBe(3);
  expect(calendars[0].source.recordCount).toBe(2);
  for (const changed of [
    { ...response, result: { ...response.result, total: 4 } },
    {
      ...response,
      result: { ...response.result, resource_id: 'another-dataset' },
    },
    {
      ...response,
      result: {
        ...response.result,
        records: [
          ...response.result.records.slice(0, 2),
          response.result.records[0],
        ],
      },
    },
    {
      ...response,
      result: {
        ...response.result,
        records: [
          ...response.result.records.slice(0, 2),
          { date: '2026-02-30', holiday: 'Invalid' },
        ],
      },
    },
  ]) {
    expect(() =>
      publicHolidayCalendarsFromDataGov(
        Buffer.from(JSON.stringify(changed)),
        options,
      ),
    ).toThrow();
  }
  expect(() =>
    PublicHolidayCalendarSchema.parse({ ...calendars[0], id: 'SG-2027' }),
  ).toThrow();
});
