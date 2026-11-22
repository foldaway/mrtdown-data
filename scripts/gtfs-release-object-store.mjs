import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/** Dedicated prefix only. Existing Pages read credentials remain unchanged. */
export function s3ReleaseStore({
  bucket,
  prefix = 'gtfs-release-history',
  credentials,
  client,
}) {
  if (
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
    prefix !== 'gtfs-release-history'
  )
    throw new Error('Expected the dedicated private release-retention prefix');
  const s3 =
    client ??
    new S3Client({
      region: 'auto',
      endpoint: 'https://t3.storage.dev',
      forcePathStyle: true,
      credentials,
    });
  function key(value) {
    if (
      !/^(index\.json|staged\.json|writer-lock\.json|(sources|canonical|generators|recipes|records|bundles)\/[a-f0-9]{64}\.(json|zip|tar\.gz))$/.test(
        value,
      )
    )
      throw new Error('Key is outside the retention layout');
    if (/^sources\/[a-f0-9]{64}\.zip$/.test(value))
      return `blobs/schedule/${value.slice('sources/'.length)}`;
    return `${prefix}/${value}`;
  }
  return {
    async read(value) {
      try {
        const result = await s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: key(value) }),
        );
        return {
          bytes: Buffer.from(await result.Body.transformToByteArray()),
          etag: result.ETag,
        };
      } catch (error) {
        if (error.$metadata?.httpStatusCode === 404) return null;
        throw error;
      }
    },
    async write(value, bytes, etag) {
      if (value.startsWith('sources/'))
        throw new Error(
          'Missing crawler source; retain it through the capture pipeline before archiving a release',
        );
      const result = await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key(value),
          Body: bytes,
          ContentType: value.endsWith('.json')
            ? 'application/json'
            : 'application/octet-stream',
          ...(etag === null ? { IfNoneMatch: '*' } : { IfMatch: etag }),
        }),
      );
      if (!result.ETag)
        throw new Error('Retention write returned no object identity');
      return result.ETag;
    },
    async remove(value, etag) {
      if (value !== 'writer-lock.json' && !value.startsWith('bundles/'))
        throw new Error(
          'Only ready bundles and the owned writer lock may be removed',
        );
      if (!etag)
        throw new Error(
          'Conditional deletion requires the observed object identity',
        );
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key(value),
          IfMatch: etag,
        }),
      );
    },
  };
}
