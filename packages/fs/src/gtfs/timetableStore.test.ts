import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  sourceReview as review,
  timetableStoreFixture,
} from './__tests__/timetableStoreFixture.js';
import {
  prepareScheduledTimetableArtifact,
  verifyScheduledTimetableArtifact,
} from './timetableArtifact.js';
import {
  importScheduledTimetableArtifact,
  readRetainedScheduledTimetable,
  readScheduledTimetableHistory,
} from './timetableStore.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, writeFile: vi.fn(original.writeFile) };
});
const original =
  await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
const roots: string[] = [];
afterEach(async () => {
  vi.mocked(writeFile).mockImplementation(original.writeFile);
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'timetable-store-'));
  roots.push(root);
  return timetableStoreFixture(root);
}

describe('retained timetable imports', () => {
  it('retains an audited baseline, correction and resolved successor without rewriting earlier versions', async () => {
    const { settings, first, corrected, successor, run } = await fixture();
    expect(await run(first, review('baseline', first))).toMatchObject({
      imported: true,
      action: 'baseline',
    });
    const originalReceipt = await readFile(
      join(settings.storeDir, first.manifestSha256, 'import.json'),
    );
    expect(
      await run(corrected, review('correction', corrected, first)),
    ).toMatchObject({ imported: true, action: 'correction' });
    expect(
      await run(
        successor,
        review('resolve-version-conflict', successor, corrected),
      ),
    ).toMatchObject({ imported: true, action: 'successor' });
    expect(await run(first)).toMatchObject({
      imported: false,
      action: 'already-retained',
    });
    const history = await readScheduledTimetableHistory(settings.storeDir);
    expect(history.map((version) => version.manifestSha256)).toEqual([
      first.manifestSha256,
      corrected.manifestSha256,
      successor.manifestSha256,
    ]);
    expect(
      await readFile(
        join(settings.storeDir, first.manifestSha256, 'import.json'),
      ),
    ).toEqual(originalReceipt);
    const retained = await readRetainedScheduledTimetable(
      settings.storeDir,
      first.manifestSha256,
    );
    expect(
      retained.timetable.timetable.trips[0].stopTimes[0].departureSeconds,
    ).toBe(90000);
    expect(retained.timetable.patterns[0].pattern.stops[0].platformIds).toEqual(
      ['A', 'C'],
    );
    expect((await readdir(settings.storeDir)).sort()).toEqual(
      history.map((version) => version.manifestSha256).sort(),
    );
  });

  it('preserves history when reviews, bytes, canonical data or a return to an older source are rejected', async () => {
    const { settings, first, corrected, successor, run } = await fixture();
    expect(await run(first)).toMatchObject({
      imported: false,
      blockers: ['source-review-required'],
    });
    expect(await readdir(settings.storeDir)).toEqual([]);
    await run(first, review('baseline', first));
    expect(await run(successor)).toMatchObject({
      imported: false,
      blockers: ['provider-version-conflict'],
    });
    await expect(
      run(
        { ...corrected, timetableBytes: Buffer.from('{}') },
        review('correction', corrected, first),
      ),
    ).rejects.toThrow('size and SHA-256');
    const invalidManifest = {
      ...corrected.manifest,
      identity: {
        ...corrected.manifest.identity,
        topology: { projectionVersion: 1 as const, sha256: 'e'.repeat(64) },
      },
    };
    const {
      timetable: _timetable,
      notice: _notice,
      ...metadata
    } = invalidManifest;
    const { timetable } = verifyScheduledTimetableArtifact(
      corrected.manifestBytes,
      corrected.manifestSha256,
      corrected,
    );
    const stale = prepareScheduledTimetableArtifact(timetable, metadata);
    await expect(
      run(stale, review('correction', stale, first)),
    ).rejects.toThrow('topology fingerprint');
    await run(successor, review('resolve-version-conflict', successor, first));
    expect(
      await run(
        corrected,
        review('resolve-version-conflict', corrected, successor),
      ),
    ).toMatchObject({
      imported: false,
      blockers: ['older-source-already-retained'],
    });
    expect(
      (await readScheduledTimetableHistory(settings.storeDir)).map(
        (item) => item.manifestSha256,
      ),
    ).toEqual([first.manifestSha256, successor.manifestSha256]);
    await expect(
      importScheduledTimetableArtifact(first, first.manifestSha256, {
        ...settings,
        storeDir: settings.dataDir,
      }),
    ).rejects.toThrow('must not overlap');
    await writeFile(
      join(settings.storeDir, first.manifestSha256, 'timetable.json'),
      '{}',
    );
    await expect(
      readRetainedScheduledTimetable(settings.storeDir, first.manifestSha256),
    ).rejects.toThrow('size and SHA-256');
    const receiptPath = join(
      settings.storeDir,
      successor.manifestSha256,
      'import.json',
    );
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    receipt.predecessorSha256 = 'f'.repeat(64);
    await writeFile(receiptPath, JSON.stringify(receipt));
    await expect(
      readScheduledTimetableHistory(settings.storeDir),
    ).rejects.toThrow('incomplete or cyclic');
  });

  it('publishes complete versions atomically and refuses concurrent writers, cleaning failed staging', async () => {
    const { settings, first, corrected, run } = await fixture();
    await run(first, review('baseline', first));
    vi.mocked(writeFile).mockImplementation(async (path, data, options) => {
      if (String(path).endsWith('NOTICE.txt')) {
        throw new Error('Synthetic interrupted write');
      }
      return original.writeFile(path, data, options);
    });
    await expect(
      run(corrected, review('correction', corrected, first)),
    ).rejects.toThrow('Synthetic interrupted write');
    expect(await readdir(settings.storeDir)).toEqual([first.manifestSha256]);
    let entered!: () => void;
    let resume!: () => void;
    const writing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const paused = new Promise<void>((resolve) => {
      resume = resolve;
    });
    vi.mocked(writeFile).mockImplementation(async (path, data, options) => {
      if (String(path).endsWith('NOTICE.txt')) {
        entered();
        await paused;
      }
      return original.writeFile(path, data, options);
    });
    const importing = run(corrected, review('correction', corrected, first));
    try {
      await writing;
      expect(
        (await readScheduledTimetableHistory(settings.storeDir)).map(
          (item) => item.manifestSha256,
        ),
      ).toEqual([first.manifestSha256]);
      await expect(
        run(corrected, review('correction', corrected, first)),
      ).rejects.toMatchObject({ code: 'EEXIST' });
    } finally {
      resume();
      await importing;
    }
    expect(
      (await readScheduledTimetableHistory(settings.storeDir)).map(
        (item) => item.manifestSha256,
      ),
    ).toEqual([first.manifestSha256, corrected.manifestSha256]);
    expect((await readdir(settings.storeDir)).sort()).toEqual(
      [first.manifestSha256, corrected.manifestSha256].sort(),
    );
  });
});
