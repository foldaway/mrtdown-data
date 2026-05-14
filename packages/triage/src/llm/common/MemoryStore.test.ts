import { describe, expect, test } from 'vitest';
import { MemoryStore } from './MemoryStore.js';

describe('MemoryStore', () => {
  describe('constructor', () => {
    test('creates empty store by default', () => {
      const store = new MemoryStore();
      expect(store.dumpFiles()).toEqual({});
      expect(store.listDir('')).toEqual([]);
    });

    test('seeds store with files from seed object', () => {
      const store = new MemoryStore({
        files: {
          'foo.txt': 'hello',
          'bar/baz.json': '{"x":1}',
        },
      });
      expect(store.readText('foo.txt')).toBe('hello');
      expect(store.readText('bar/baz.json')).toBe('{"x":1}');
      expect(store.listDir('')).toEqual(['bar', 'foo.txt']);
      expect(store.listDir('bar')).toEqual(['baz.json']);
    });
  });

  describe('exists', () => {
    test('returns false for non-existent path', () => {
      const store = new MemoryStore();
      expect(store.exists('missing')).toBe(false);
      expect(store.exists('a/b/c')).toBe(false);
    });

    test('returns true for root directory', () => {
      const store = new MemoryStore();
      expect(store.exists('')).toBe(true);
    });

    test('returns true for existing file', () => {
      const store = new MemoryStore({ files: { 'foo.txt': 'hi' } });
      expect(store.exists('foo.txt')).toBe(true);
    });

    test('returns true for existing directory', () => {
      const store = new MemoryStore({ files: { 'dir/file.txt': 'hi' } });
      expect(store.exists('dir')).toBe(true);
    });

    test('normalizes path when checking', () => {
      const store = new MemoryStore({ files: { 'foo.txt': 'hi' } });
      expect(store.exists('foo.txt')).toBe(true);
      expect(store.exists('./foo.txt')).toBe(true);
    });
  });

  describe('readText', () => {
    test('returns content of existing file', () => {
      const store = new MemoryStore({ files: { 'foo.txt': 'hello world' } });
      expect(store.readText('foo.txt')).toBe('hello world');
    });

    test('throws for non-existent file', () => {
      const store = new MemoryStore();
      expect(() => store.readText('missing.txt')).toThrow(
        'MemoryStore: File not found: missing.txt',
      );
    });

    test('normalizes path when reading', () => {
      const store = new MemoryStore({ files: { 'a/b.txt': 'content' } });
      expect(store.readText('./a/b.txt')).toBe('content');
    });
  });

  describe('readJson', () => {
    test('parses and returns JSON', () => {
      const store = new MemoryStore({
        files: { 'data.json': '{"name":"test","count":42}' },
      });
      const data = store.readJson<{ name: string; count: number }>('data.json');
      expect(data).toEqual({ name: 'test', count: 42 });
    });

    test('throws for invalid JSON', () => {
      const store = new MemoryStore({ files: { 'bad.json': 'not json' } });
      expect(() => store.readJson('bad.json')).toThrow();
    });
  });

  describe('listDir', () => {
    test('returns sorted list of children for root', () => {
      const store = new MemoryStore({
        files: {
          'a.txt': 'a',
          'z.txt': 'z',
          'm.txt': 'm',
          'dir/file.txt': 'f',
        },
      });
      expect(store.listDir('')).toEqual(['a.txt', 'dir', 'm.txt', 'z.txt']);
    });

    test('returns sorted list of children for nested dir', () => {
      const store = new MemoryStore({
        files: {
          'parent/child1.txt': '1',
          'parent/child2.txt': '2',
          'parent/subdir/file.txt': '3',
        },
      });
      expect(store.listDir('parent')).toEqual([
        'child1.txt',
        'child2.txt',
        'subdir',
      ]);
    });

    test('returns empty array for empty directory', () => {
      const store = new MemoryStore();
      expect(store.listDir('')).toEqual([]);
    });

    test('excludes dot-prefixed entries', () => {
      const store = new MemoryStore();
      store.writeText('.DS_Store', '');
      store.writeText('visible.txt', 'x');
      expect(store.listDir('')).toEqual(['visible.txt']);
    });

    test('throws for non-existent directory', () => {
      const store = new MemoryStore();
      expect(() => store.listDir('missing')).toThrow(
        'MemoryStore: Directory not found: missing',
      );
    });
  });

  describe('ensureDir', () => {
    test('creates nested directories recursively', () => {
      const store = new MemoryStore();
      store.ensureDir('a/b/c');
      expect(store.exists('a')).toBe(true);
      expect(store.exists('a/b')).toBe(true);
      expect(store.exists('a/b/c')).toBe(true);
      expect(store.listDir('a')).toEqual(['b']);
      expect(store.listDir('a/b')).toEqual(['c']);
      expect(store.listDir('a/b/c')).toEqual([]);
    });

    test('is idempotent for existing directory', () => {
      const store = new MemoryStore();
      store.ensureDir('x');
      store.ensureDir('x');
      expect(store.listDir('x')).toEqual([]);
    });
  });

  describe('writeText', () => {
    test('writes file and creates parent directories', () => {
      const store = new MemoryStore();
      store.writeText('deep/path/file.txt', 'content');
      expect(store.readText('deep/path/file.txt')).toBe('content');
      expect(store.listDir('deep')).toEqual(['path']);
      expect(store.listDir('deep/path')).toEqual(['file.txt']);
    });

    test('overwrites existing file', () => {
      const store = new MemoryStore({ files: { 'foo.txt': 'old' } });
      store.writeText('foo.txt', 'new');
      expect(store.readText('foo.txt')).toBe('new');
    });
  });

  describe('writeJson', () => {
    test('writes JSON-serialized data', () => {
      const store = new MemoryStore();
      store.writeJson('data.json', { foo: 'bar', num: 123 });
      expect(store.readText('data.json')).toBe('{"foo":"bar","num":123}');
      expect(store.readJson('data.json')).toEqual({ foo: 'bar', num: 123 });
    });
  });

  describe('appendText', () => {
    test('creates new file when path does not exist', () => {
      const store = new MemoryStore();
      store.appendText('log.txt', 'line1\n');
      expect(store.readText('log.txt')).toBe('line1\n');
    });

    test('appends to existing file', () => {
      const store = new MemoryStore({ files: { 'log.txt': 'line1\n' } });
      store.appendText('log.txt', 'line2\n');
      store.appendText('log.txt', 'line3\n');
      expect(store.readText('log.txt')).toBe('line1\nline2\nline3\n');
    });

    test('creates parent directories when needed', () => {
      const store = new MemoryStore();
      store.appendText('logs/2025/app.log', 'entry\n');
      expect(store.readText('logs/2025/app.log')).toBe('entry\n');
    });
  });

  describe('delete', () => {
    test('removes file', () => {
      const store = new MemoryStore({ files: { 'foo.txt': 'hi' } });
      store.delete('foo.txt');
      expect(store.exists('foo.txt')).toBe(false);
      expect(() => store.readText('foo.txt')).toThrow();
    });

    test('removes directory', () => {
      const store = new MemoryStore({ files: { 'dir/file.txt': 'hi' } });
      store.delete('dir');
      expect(store.exists('dir')).toBe(false);
      expect(() => store.listDir('dir')).toThrow();
    });

    test('removes both normalized and original path', () => {
      const store = new MemoryStore({ files: { 'foo.txt': 'hi' } });
      store.delete('./foo.txt');
      expect(store.exists('foo.txt')).toBe(false);
    });
  });

  describe('dumpFiles', () => {
    test('returns copy of all files', () => {
      const store = new MemoryStore({
        files: {
          'a.txt': 'a',
          'b/c.txt': 'c',
        },
      });
      const dumped = store.dumpFiles();
      expect(dumped).toEqual({
        'a.txt': 'a',
        'b/c.txt': 'c',
      });
    });

    test('returns empty object for empty store', () => {
      const store = new MemoryStore();
      expect(store.dumpFiles()).toEqual({});
    });
  });

  describe('full workflow', () => {
    test('write → read → append → read → delete cycle', () => {
      const store = new MemoryStore();
      store.writeText('notes.txt', 'First note\n');
      expect(store.readText('notes.txt')).toBe('First note\n');

      store.appendText('notes.txt', 'Second note\n');
      expect(store.readText('notes.txt')).toBe('First note\nSecond note\n');

      store.delete('notes.txt');
      expect(store.exists('notes.txt')).toBe(false);
    });

    test('nested structure with multiple operations', () => {
      const store = new MemoryStore();
      store.writeText('issues/2025-01-01-disruption.json', '{}');
      store.writeText('issues/2025-01-02-maintenance.json', '{}');
      store.writeJson('config.json', { version: 1 });

      expect(store.listDir('')).toEqual(['config.json', 'issues']);
      expect(store.listDir('issues')).toEqual([
        '2025-01-01-disruption.json',
        '2025-01-02-maintenance.json',
      ]);
      expect(store.readJson('config.json')).toEqual({ version: 1 });
    });
  });
});
