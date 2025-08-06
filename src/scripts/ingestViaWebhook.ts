import { assert } from '../util/assert';
import { ingestContent } from '../util/ingestContent';
import type { IngestContent } from '../util/ingestContent/types';

const { MESSAGE } = process.env;
assert(MESSAGE != null, 'Expected MESSAGE env var');

const message = JSON.parse(MESSAGE) as {
  content: IngestContent[];
};
for (const content of message.content) {
  await ingestContent(content);
}
