import type { IStore } from '../repo/common/store.js';

export function loadJson<T>(store: IStore, path: string): T | null {
  try {
    return store.readJson<T>(path);
  } catch {
    return null;
  }
}
