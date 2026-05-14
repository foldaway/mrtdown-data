import type { z } from 'zod';
import { assert } from '../util/assert.js';
import { ingestContent } from '../util/ingestContent/index.js';
import { IngestMessageSchema } from '../util/ingestContent/types.js';

const { MESSAGE } = process.env;
assert(MESSAGE != null, 'Expected MESSAGE env var');

let message: z.infer<typeof IngestMessageSchema>;
try {
  message = IngestMessageSchema.parse(JSON.parse(MESSAGE));
} catch (error) {
  console.error('[ingestViaWebhook] Invalid MESSAGE payload:', error);
  process.exit(1);
}

for (const content of message.content) {
  await ingestContent(content);
}
