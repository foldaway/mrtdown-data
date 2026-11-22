import { expect, test } from 'vitest';
import { s3ReleaseStore } from './gtfs-release-object-store.mjs';

test('S3 adapter reuses crawler source blobs, scopes writes, and sends conditional operations', async () => {
  const commands: { input: Record<string, unknown> }[] = [];
  const client = {
    async send(command: { input: Record<string, unknown> }) {
      commands.push(command);
      return {
        ETag: 'observed',
        Body: { transformToByteArray: async () => Buffer.from('bytes') },
      };
    },
  };
  const store = s3ReleaseStore({ bucket: 'test-bucket', client });
  const hash = 'a'.repeat(64);
  await store.read(`sources/${hash}.zip`);
  expect(commands.at(-1)?.input.Key).toBe(`blobs/schedule/${hash}.zip`);
  await expect(
    store.write(`sources/${hash}.zip`, Buffer.from('no'), null),
  ).rejects.toThrow('capture pipeline');
  await store.write('index.json', Buffer.from('{}'), null);
  expect(commands.at(-1)?.input.IfNoneMatch).toBe('*');
  await store.write('index.json', Buffer.from('{}'), 'old');
  expect(commands.at(-1)?.input.IfMatch).toBe('old');
  await expect(store.remove(`recipes/${hash}.zip`, 'observed')).rejects.toThrow(
    'Only ready bundles',
  );
  await store.remove(`bundles/${hash}.zip`, 'observed');
  expect(commands.at(-1)?.input.IfMatch).toBe('observed');
});
