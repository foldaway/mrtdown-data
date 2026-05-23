import {
  type IngestPayload,
  IngestPayloadSchema,
} from '@mrtdown/ingest-contracts';
import { assert } from '../util/assert.js';
import { ingestContent } from '../util/ingestContent/index.js';

const { MESSAGE } = process.env;
assert(MESSAGE != null, 'Expected MESSAGE env var');

let message: IngestPayload;
try {
  message = IngestPayloadSchema.parse(JSON.parse(MESSAGE));
} catch (error) {
  console.error('[ingestViaWebhook] Invalid MESSAGE payload:', error);
  process.exit(1);
}

for (const content of message.content) {
  await ingestContent(content);
}
