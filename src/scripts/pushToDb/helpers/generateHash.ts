import crypto from 'node:crypto';

export function generateHash(item: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(item)).digest();
}
