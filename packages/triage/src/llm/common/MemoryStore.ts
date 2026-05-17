import { basename, dirname, normalize } from 'node:path';
import type { IStore, IWriteStore } from '@mrtdown/fs';

export class MemoryStore implements IStore, IWriteStore {
  private readonly files = new Map<string, string>();
  private readonly dirs = new Map<string, Set<string>>();

  constructor(seed?: { files?: Record<string, string> }) {
    // Root dir
    this.dirs.set('', new Set());

    if (seed?.files) {
      for (const [path, text] of Object.entries(seed.files)) {
        this.writeText(path, text);
      }
    }
  }

  // --------- IStore ---------
  private toStorePath(path: string): string {
    const p = normalize(path);
    return p === '.' ? '' : p;
  }

  exists(path: string): boolean {
    const p = this.toStorePath(path);
    return this.files.has(p) || this.dirs.has(p);
  }

  readText(path: string): string {
    const p = this.toStorePath(path);
    const v = this.files.get(p);
    if (v == null) {
      throw new Error(`MemoryStore: File not found: ${path}`);
    }
    return v;
  }

  readJson<T>(path: string): T {
    return JSON.parse(this.readText(path));
  }

  listDir(path: string): string[] {
    const p = this.toStorePath(path);
    const children = this.dirs.get(p);
    if (children == null) {
      throw new Error(`MemoryStore: Directory not found: ${path}`);
    }
    return Array.from(children.values())
      .filter((name) => !name.startsWith('.'))
      .sort();
  }

  // --------- IWriteStore ---------
  ensureDir(path: string): void {
    const p = this.toStorePath(path);
    if (this.dirs.has(p)) {
      return;
    }

    // Ensure parents (dirname returns '.' for root, treat as '')
    const rawParent = dirname(p === '' ? '.' : p);
    const parent = rawParent === '.' ? '' : rawParent;
    if (parent !== '') {
      this.ensureDir(parent);
    }

    // Create this directory
    this.dirs.set(p, new Set());

    // Register in parent (including root when parent is '')
    this.addChild(parent, basename(p));
  }

  createDir(path: string): void {
    const p = this.toStorePath(path);
    if (this.dirs.has(p) || this.files.has(p)) {
      throwErrno(`MemoryStore: Path already exists: ${path}`, 'EEXIST');
    }

    const parent = dirname(p) === '.' ? '' : dirname(p);
    if (!this.dirs.has(parent)) {
      throwErrno(`MemoryStore: Parent directory not found: ${path}`, 'ENOENT');
    }

    this.dirs.set(p, new Set());
    this.addChild(parent, basename(p));
  }

  private addChild(dir: string, child: string): void {
    const d = this.toStorePath(dir);
    const set = this.dirs.get(d);
    if (set == null) {
      this.ensureDir(d);
      this.addChild(d, child);
      return;
    }
    set.add(child);
  }

  writeText(path: string, text: string): void {
    const p = this.toStorePath(path);
    this.ensureDir(dirname(p));
    this.addChild(dirname(p), basename(p));
    this.files.set(p, text);
  }

  writeJson(path: string, json: unknown): void {
    this.writeText(path, JSON.stringify(json));
  }

  createJson(path: string, json: unknown): void {
    const p = this.toStorePath(path);
    if (this.files.has(p) || this.dirs.has(p)) {
      throwErrno(`MemoryStore: Path already exists: ${path}`, 'EEXIST');
    }
    this.writeJson(path, json);
  }

  appendText(path: string, text: string): void {
    const p = this.toStorePath(path);
    this.ensureDir(dirname(p));
    this.addChild(dirname(p), basename(p));
    const prevContent = this.files.get(p) ?? '';
    this.files.set(p, prevContent + text);
  }

  delete(path: string): void {
    const p = this.toStorePath(path);
    if (p === '') {
      throw new Error('MemoryStore: Cannot delete root directory');
    }

    const parent = dirname(p) === '.' ? '' : dirname(p);
    const child = basename(p);

    this.files.delete(p);

    if (this.dirs.has(p)) {
      for (const filePath of [...this.files.keys()]) {
        if (filePath.startsWith(`${p}/`)) {
          this.files.delete(filePath);
        }
      }
      for (const dirPath of [...this.dirs.keys()]) {
        if (dirPath === p || dirPath.startsWith(`${p}/`)) {
          this.dirs.delete(dirPath);
        }
      }
    }

    this.dirs.get(parent)?.delete(child);
  }

  // Debug helpers
  dumpFiles(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [path, text] of this.files.entries()) {
      result[path] = text;
    }
    return result;
  }
}

function throwErrno(message: string, code: string): never {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = code;
  throw error;
}
