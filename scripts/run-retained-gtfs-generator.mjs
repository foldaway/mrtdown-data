import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [code, inputs, canonical, root] = process.argv.slice(2);
const { prepareHistoricalCombinedTimetableReplay } = await import(
  pathToFileURL(join(code, 'scripts/export-pages-combined-timetable.mjs')).href
);
const exporter = await prepareHistoricalCombinedTimetableReplay({
  gtfsFile: join(inputs, 'schedule.zip'),
  gtfsCapture: join(inputs, 'capture.json'),
  gtfsCombinedConfig: join(inputs, 'combined-pages.json'),
  outDir: join(root, 'unused-publication-output'),
});
const result = await exporter(join(canonical, 'data'));
await writeFile(join(root, 'generator-result.json'), JSON.stringify(result), {
  flag: 'wx',
});
