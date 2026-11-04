import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyPublicHolidayCalendars,
  publicHolidayCalendarsFromDataGov,
} from '../packages/fs/dist/index.js';

const [file, ...args] = process.argv.slice(2);
const options = { dataDir: 'data', apply: false };
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === '--apply' && !options.apply) {
    options.apply = true;
  } else {
    const key = {
      '--checked-on': 'checkedOn',
      '--source-updated-on': 'datasetUpdatedOn',
      '--data-dir': 'dataDir',
    }[arg];
    const value = args[++index];
    if (!key || !value || value.startsWith('--')) {
      throw new Error('Unknown or incomplete public-holiday import option');
    }
    options[key] = value;
  }
}
if (!file || !options.checkedOn || !options.datasetUpdatedOn) {
  throw new Error(
    'Usage: node scripts/import-public-holidays.mjs <complete-api-response.json> --checked-on <date> --source-updated-on <date> [--data-dir <path>] [--apply]',
  );
}
const root = fileURLToPath(new URL('..', import.meta.url));
const calendars = publicHolidayCalendarsFromDataGov(
  await readFile(resolve(file)),
  options,
);
if (options.apply) {
  await applyPublicHolidayCalendars(resolve(root, options.dataDir), calendars);
}
console.log(
  JSON.stringify(
    {
      applied: options.apply,
      calendars: calendars.map((calendar) => ({
        id: calendar.id,
        dates: calendar.dates.length,
      })),
    },
    null,
    2,
  ),
);
