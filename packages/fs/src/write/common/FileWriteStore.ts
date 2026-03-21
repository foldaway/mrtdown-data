import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IWriteStore } from './store.js';

/**
 * A write store that writes to the file system.
 */
export class FileWriteStore implements IWriteStore {
  constructor(private readonly rootDir: string) {}

  writeText(path: string, text: string): void {
    const fullPath = join(this.rootDir, path);
    writeFileSync(fullPath, text);
  }

  writeJson(path: string, json: unknown): void {
    this.writeText(path, JSON.stringify(json, null, 2));
  }

  appendText(path: string, text: string): void {
    const fullPath = join(this.rootDir, path);
    appendFileSync(fullPath, text);
  }

  ensureDir(path: string): void {
    const fullPath = join(this.rootDir, path);
    mkdirSync(fullPath, { recursive: true });
  }

  delete(path: string): void {
    const fullPath = join(this.rootDir, path);
    rmSync(fullPath);
  }
}
