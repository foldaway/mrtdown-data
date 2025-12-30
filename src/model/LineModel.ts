import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { Line, LineId } from '../schema/Line.js';

const dirPathLine = join(
  import.meta.dirname,
  '../../data/source/line',
);

export const LineModel = {
  getAllIds(): LineId[] {
    const dirFilesLine = readdirSync(dirPathLine);

    const result: LineId[] = [];

    for (const fileName of dirFilesLine) {
      result.push(basename(fileName, extname(fileName)));
    }

    return result;
  },

  getAll(): Line[] {
    const dirFilesLine = readdirSync(dirPathLine);

    const result: Line[] = [];

    for (const fileName of dirFilesLine) {
      const filePath = join(dirPathLine, fileName);
      const line = JSON.parse(
        readFileSync(filePath, { encoding: 'utf-8' }),
      ) as Line;
      result.push(line);
    }

    return result;
  },

  getOne(id: string): Line {
    const fileName = `${id}.json`;

    const filePath = join(dirPathLine, fileName);
    const line = JSON.parse(
      readFileSync(filePath, { encoding: 'utf-8' }),
    ) as Line & { $schema: string };
    return line;
  },

  save(line: Line) {
    const fileName = `${line.id}.json`;
    const filePath = join(dirPathLine, fileName);
    writeFileSync(filePath, JSON.stringify(line, null, 2), {
      encoding: 'utf-8',
    });
  },
};
