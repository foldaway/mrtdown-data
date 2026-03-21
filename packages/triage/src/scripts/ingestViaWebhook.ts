import { assert } from '../util/assert.js';
import { ingestContent } from '../util/ingestContent/index.js';
import type { IngestContent } from '../util/ingestContent/types.js';

const { MESSAGE } = process.env;
assert(MESSAGE != null, 'Expected MESSAGE env var');

const message = JSON.parse(MESSAGE) as {
  content: IngestContent[];
};
for (const content of message.content) {
  await ingestContent(content);
}
