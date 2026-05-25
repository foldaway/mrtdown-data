import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runCli } from './index.js';

const fixtureDataDir = resolve(
  process.env.MRTDOWN_FIXTURE_DATA_DIR ??
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../fixtures/generated/data',
    ),
);
const fixtureMeta = JSON.parse(
  readFileSync(
    process.env.MRTDOWN_FIXTURE_META_PATH ??
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../../fixtures/generated/meta.json',
      ),
    'utf8',
  ),
) as {
  counts: Record<string, number>;
  issueOrder: string[];
  stations: { primary: { id: string; name: string } };
};

function createIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
    },
    stdout,
    stderr,
  };
}

describe('@mrtdown/cli', () => {
  it('validates fixture data', async () => {
    const { io, stdout, stderr } = createIo();
    const code = await runCli(['--data-dir', fixtureDataDir, 'validate'], io);

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout[0] as string)).toMatchObject(fixtureMeta.counts);
  });

  it('lists and shows records', async () => {
    const list = createIo();
    await expect(
      runCli(['--data-dir', fixtureDataDir, 'list', 'issue'], list.io),
    ).resolves.toBe(0);
    expect((list.stdout[0] as string).split('\n')).toEqual(
      fixtureMeta.issueOrder,
    );

    const show = createIo();
    await expect(
      runCli(
        [
          '--data-dir',
          fixtureDataDir,
          'show',
          'station',
          fixtureMeta.stations.primary.id,
        ],
        show.io,
      ),
    ).resolves.toBe(0);
    expect(JSON.parse(show.stdout[0] as string).value.name['en-SG']).toBe(
      fixtureMeta.stations.primary.name,
    );
  });

  it('creates issues through the CLI', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-cli-'));
    const { io, stdout } = createIo();

    const code = await runCli(
      [
        '--data-dir',
        dataDir,
        'create',
        'issue',
        '--date',
        '2026-05-12',
        '--title',
        'Signal fault at Test Station',
      ],
      io,
    );

    expect(code).toBe(0);
    expect(stdout).toEqual([
      'issue/2026/05/2026-05-12-signal-fault-at-test-station',
    ]);
  });

  it('creates static entities from JSON files', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-cli-'));
    const { io, stdout } = createIo();

    const code = await runCli(
      [
        '--data-dir',
        dataDir,
        'create',
        'station',
        '--file',
        resolve(
          fixtureDataDir,
          `station/${fixtureMeta.stations.primary.id}.json`,
        ),
      ],
      io,
    );

    expect(code).toBe(0);
    expect(stdout).toEqual([`station/${fixtureMeta.stations.primary.id}.json`]);
    await expect(
      readFile(
        resolve(dataDir, `station/${fixtureMeta.stations.primary.id}.json`),
        'utf8',
      ),
    ).resolves.toContain(fixtureMeta.stations.primary.name);
  });

  it('resolves create --file relative to the provided cwd', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'mrtdown-cli-cwd-'));
    const stationFilename = `${fixtureMeta.stations.primary.id}.json`;
    await writeFile(
      join(cwd, stationFilename),
      await readFile(
        resolve(fixtureDataDir, `station/${stationFilename}`),
        'utf8',
      ),
    );
    const { io, stdout } = createIo();

    const code = await runCli(
      ['--data-dir', 'data', 'create', 'station', '--file', stationFilename],
      io,
      cwd,
    );

    expect(code).toBe(0);
    expect(stdout).toEqual([`station/${stationFilename}`]);
    await expect(
      readFile(resolve(cwd, `data/station/${stationFilename}`), 'utf8'),
    ).resolves.toContain(fixtureMeta.stations.primary.name);
  });
});
