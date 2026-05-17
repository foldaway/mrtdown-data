import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { IWriteStore } from './store.js';

/**
 * A write store that writes to the file system.
 */
export class FileWriteStore implements IWriteStore {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = resolve(rootDir);
  }

  readText(path: string): string {
    const fullPath = this.resolvePath(path);
    return readFileSync(fullPath, { encoding: 'utf-8' });
  }

  writeText(path: string, text: string): void {
    const fullPath = this.resolvePath(path);
    writeFileSync(fullPath, text);
  }

  writeJson(path: string, json: unknown): void {
    this.writeText(path, JSON.stringify(json, null, 2));
  }

  createJson(path: string, json: unknown): void {
    const fullPath = this.resolvePath(path);
    writeFileSync(fullPath, JSON.stringify(json, null, 2), { flag: 'wx' });
  }

  appendText(path: string, text: string): void {
    const fullPath = this.resolvePath(path);
    appendFileSync(fullPath, text);
  }

  ensureDir(path: string): void {
    const fullPath = this.resolvePath(path);
    mkdirSync(fullPath, { recursive: true });
  }

  createDir(path: string): void {
    const fullPath = this.resolvePath(path);
    mkdirSync(fullPath);
  }

  delete(path: string): void {
    const fullPath = this.resolvePath(path);
    rmSync(fullPath, { recursive: true, force: true });
  }

  private resolvePath(path: string): string {
    const fullPath = resolve(this.rootDir, path);
    const relativePath = relative(this.rootDir, fullPath);
    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw new Error(`Path escapes store root: ${path}`);
    }
    return fullPath;
  }
}
