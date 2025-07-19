import { assert } from '../util/assert';
import { ingestContent } from '../util/ingestContent';
import type { IngestContent } from '../util/ingestContent/types';

const { MESSAGE } = process.env;
assert(MESSAGE != null, 'Expected MESSAGE env var');

const ingestContents = JSON.parse(MESSAGE) as IngestContent[];
for (const content of ingestContents) {
  await ingestContent(content);
}
