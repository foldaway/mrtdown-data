import { posix } from 'node:path';

export function toDataPath(path: string): string {
  if (path.length === 0) {
    return path;
  }
  return posix.normalize(path.replace(/\\/g, '/'));
}
