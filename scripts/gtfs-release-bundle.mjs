import { hashBytes } from '../packages/fs/dist/index.js';
import { deterministicZip, verifyObject } from './gtfs-release-inputs.mjs';

/** Offsets in a ZIP produced by our deterministic zipSync encoder, not an input archive. */
function timestampOffsets(bytes) {
  const end = bytes.length - 22;
  if (end < 0 || bytes.readUInt32LE(end) !== 0x06054b50)
    throw new Error('Unexpected generated ZIP footer');
  const offsets = [];
  let central = bytes.readUInt32LE(end + 16);
  for (let n = bytes.readUInt16LE(end + 10); n > 0; n--) {
    if (central + 46 > end || bytes.readUInt32LE(central) !== 0x02014b50)
      throw new Error('Unexpected generated ZIP directory');
    const local = bytes.readUInt32LE(central + 42);
    if (local + 30 > central || bytes.readUInt32LE(local) !== 0x04034b50)
      throw new Error('Unexpected generated ZIP entry');
    offsets.push(local + 10, central + 12);
    central +=
      46 +
      bytes.readUInt16LE(central + 28) +
      bytes.readUInt16LE(central + 30) +
      bytes.readUInt16LE(central + 32);
  }
  if (central !== end) throw new Error('Unexpected generated ZIP size');
  return offsets;
}

/** Preserve immutable legacy records whose fixed UTC epoch was encoded in local time. */
export function rebuildRetainedBundle(files, expected) {
  const bytes = deterministicZip(files);
  if (
    bytes.length === expected.byteLength &&
    hashBytes(bytes) === expected.sha256
  )
    return bytes;
  if (bytes.length === expected.byteLength) {
    const offsets = timestampOffsets(bytes);
    // The old encoder used 2000-01-01T00:00Z through local calendar fields.
    // All civil offsets at that instant were quarter hours within this range.
    // Change metadata only; an exact recorded digest must still match.
    for (let minutes = -12 * 60; minutes <= 14 * 60; minutes += 15) {
      const date = new Date(Date.UTC(2000, 0, 1, 0, minutes));
      const dos =
        ((date.getUTCFullYear() - 1980) << 25) |
        ((date.getUTCMonth() + 1) << 21) |
        (date.getUTCDate() << 16) |
        (date.getUTCHours() << 11) |
        (date.getUTCMinutes() << 5);
      for (const offset of offsets) bytes.writeUInt32LE(dos >>> 0, offset);
      if (hashBytes(bytes) === expected.sha256) {
        verifyObject(bytes, expected);
        return bytes;
      }
    }
  }
  throw new Error(
    'Retained ready ZIP cannot be reproduced; preserving existing bundles',
  );
}
