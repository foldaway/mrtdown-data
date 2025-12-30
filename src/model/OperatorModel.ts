import { join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import type { Operator } from '../schema/Operator.js';

const dirPathOperator = join(import.meta.dirname, '../../data/source/operator');

export const OperatorModel = {
  getAll(): Operator[] {
    const dirFilesOperator = readdirSync(dirPathOperator);
    const result: Operator[] = [];

    for (const fileName of dirFilesOperator) {
      const filePath = join(dirPathOperator, fileName);
      const operator = JSON.parse(
        readFileSync(filePath, { encoding: 'utf-8' }),
      ) as Operator;
      result.push(operator);
    }

    return result;
  },
};
