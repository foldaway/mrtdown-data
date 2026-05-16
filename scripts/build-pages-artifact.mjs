import { execFile } from 'node:child_process';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);

function usage() {
  return `Usage:
  node scripts/build-pages-artifact.mjs [--data-dir <path>] [--out-dir <path>]

Defaults:
  --data-dir fixtures/data
  --out-dir pages-dist
`;
}

function parseArgs(argv) {
  const options = {
    dataDir: resolve(repoRoot, 'fixtures/data'),
    outDir: resolve(repoRoot, 'pages-dist'),
  };
  const args = [...argv];

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--help' || arg === '-h') {
      return { ...options, help: true };
    }

    if (arg !== '--data-dir' && arg !== '--out-dir') {
      throw new Error(`Unknown option: ${arg}`);
    }

    const value = args.shift();
    if (!value || value.startsWith('--')) {
      throw new Error(`${arg} requires a value`);
    }

    if (arg === '--data-dir') {
      options.dataDir = resolve(repoRoot, value);
    } else {
      options.outDir = resolve(repoRoot, value);
    }
  }

  return options;
}

async function loadFsPackage() {
  try {
    return await import('../packages/fs/dist/index.js');
  } catch (error) {
    throw new Error(
      `Unable to load built @mrtdown/fs package. Run "npm run build:fs" first. ${error}`,
    );
  }
}

async function createArchives(outDir) {
  const archiveRoot = resolve(outDir, '..', 'pages-archive-root');
  await rm(archiveRoot, { recursive: true, force: true });
  await mkdir(archiveRoot, { recursive: true });
  await cp(outDir, resolve(archiveRoot, 'data'), {
    recursive: true,
    filter: (source) => !/\/archive\.(?:tar\.gz|zip)$/.test(source),
  });

  await execFileAsync('tar', [
    '-czf',
    resolve(outDir, 'archive.tar.gz'),
    '-C',
    archiveRoot,
    'data',
  ]);
  await execFileAsync('zip', ['-rq', resolve(outDir, 'archive.zip'), 'data'], {
    cwd: archiveRoot,
  });
  await rm(archiveRoot, { recursive: true, force: true });
}

function assertOutputPath(dataDir, outDir) {
  if (
    outDir === dataDir ||
    dataDir.startsWith(`${outDir}/`) ||
    outDir.startsWith(`${dataDir}/`)
  ) {
    throw new Error('--out-dir must not overlap the data root');
  }
}

function renderRootIndex() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>MRTDown data</title>
  </head>
  <body>
    <main>
      <h1>MRTDown data</h1>
      <p>This split branch publishes only the deterministic fixture export. The canonical data export will be added after the target-layout data migration lands.</p>
      <ul>
        <li><a href="fixtures/">fixtures/</a></li>
        <li><a href="fixtures/manifest.json">fixtures/manifest.json</a></li>
        <li><a href="fixtures/archive.tar.gz">fixtures/archive.tar.gz</a></li>
        <li><a href="fixtures/archive.zip">fixtures/archive.zip</a></li>
      </ul>
    </main>
  </body>
</html>
`;
}

async function buildDataExport(sourceDataDir, exportDir, fsPackage) {
  assertOutputPath(sourceDataDir, exportDir);

  const validation = await fsPackage.validateDataRoot(sourceDataDir);
  if (!validation.ok) {
    throw new Error(validation.errors.join('\n'));
  }

  await mkdir(exportDir, { recursive: true });
  await cp(sourceDataDir, exportDir, {
    recursive: true,
    filter: (source) => !/\/(?:manifest\.json|index\.html)$/.test(source),
  });

  const manifest = await fsPackage.buildManifest(exportDir);
  await writeFile(
    resolve(exportDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    resolve(exportDir, 'index.html'),
    fsPackage.renderPagesIndex(manifest),
  );
  await createArchives(exportDir);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage().trimEnd());
    return;
  }

  const fsPackage = await loadFsPackage();

  await rm(options.outDir, { recursive: true, force: true });
  await mkdir(options.outDir, { recursive: true });
  await writeFile(resolve(options.outDir, '.nojekyll'), '');
  await writeFile(resolve(options.outDir, 'index.html'), renderRootIndex());
  await buildDataExport(
    options.dataDir,
    resolve(options.outDir, 'fixtures'),
    fsPackage,
  );

  console.log(`Built Pages artifact at ${options.outDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
