import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runCli } from './index.js';

const fixtureDataDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/data',
);

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
    expect(JSON.parse(stdout[0] as string)).toMatchObject({
      issue: 1,
      station: 1,
    });
  });

  it('lists and shows records', async () => {
    const list = createIo();
    await expect(
      runCli(['--data-dir', fixtureDataDir, 'list', 'issue'], list.io),
    ).resolves.toBe(0);
    expect(list.stdout).toEqual(['2024-01-15-circle-line-delay']);

    const show = createIo();
    await expect(
      runCli(
        ['--data-dir', fixtureDataDir, 'show', 'station', 'promenade'],
        show.io,
      ),
    ).resolves.toBe(0);
    expect(JSON.parse(show.stdout[0] as string).value.name['en-SG']).toBe(
      'Promenade',
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
        'town',
        '--file',
        resolve(fixtureDataDir, 'town/downtown-core.json'),
      ],
      io,
    );

    expect(code).toBe(0);
    expect(stdout).toEqual(['town/downtown-core.json']);
    await expect(
      readFile(resolve(dataDir, 'town/downtown-core.json'), 'utf8'),
    ).resolves.toContain('Downtown Core');
  });
});
