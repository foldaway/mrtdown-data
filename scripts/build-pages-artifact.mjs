import { execFile } from 'node:child_process';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { generateFixtures } from './generate-fixtures.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);
const generatedArchivePattern = /[\\/]archive\.(?:tar\.gz|zip)$/;
const generatedIndexPattern = /[\\/](?:manifest\.json|index\.html)$/;

function usage() {
  return `Usage:
  node scripts/build-pages-artifact.mjs [--data-dir <path>] [--out-dir <path>]

Defaults:
  --data-dir data
  --out-dir pages-dist
`;
}

function parseArgs(argv) {
  const options = {
    dataDir: resolve(repoRoot, 'data'),
    fixtureDataDir: resolve(repoRoot, 'fixtures/generated/data'),
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
    filter: (source) => !generatedArchivePattern.test(source),
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

function isSubpath(parent, candidate) {
  const path = relative(parent, candidate);
  return path !== '' && !path.startsWith('..') && !isAbsolute(path);
}

function assertOutputPath(dataDir, outDir) {
  if (
    outDir === dataDir ||
    isSubpath(outDir, dataDir) ||
    isSubpath(dataDir, outDir)
  ) {
    throw new Error('--out-dir must not overlap the data root');
  }
}

function assertArtifactPaths(options) {
  assertOutputPath(options.dataDir, options.outDir);
  assertOutputPath(options.fixtureDataDir, options.outDir);
  assertOutputPath(options.dataDir, resolve(options.outDir, 'fixtures'));
  assertOutputPath(options.fixtureDataDir, resolve(options.outDir, 'fixtures'));
}

function isExcludedDataSourcePath(sourceDataDir, source) {
  const relativeSource = relative(sourceDataDir, source);
  const [firstSegment] = relativeSource.split(/[\\/]/);
  return firstSegment === 'source';
}

function isGeneratedSchematicMapArtifactPath(sourceDataDir, source) {
  const relativeSource = relative(sourceDataDir, source);
  const pathSegments = relativeSource.split(/[\\/]/);
  return (
    pathSegments.join('/') === 'schematic-map/system/manifest.json' ||
    pathSegments.slice(0, 3).join('/') === 'schematic-map/system/version'
  );
}

async function buildDataExport(
  sourceDataDir,
  exportDir,
  fsPackage,
  options = {},
) {
  assertOutputPath(sourceDataDir, exportDir);

  await mkdir(exportDir, { recursive: true });
  await cp(sourceDataDir, exportDir, {
    recursive: true,
    filter: (source) =>
      !generatedIndexPattern.test(source) &&
      !isExcludedDataSourcePath(sourceDataDir, source) &&
      !isGeneratedSchematicMapArtifactPath(sourceDataDir, source),
  });

  await fsPackage.generateSchematicMapPublishedArtifacts(exportDir);
  await fsPackage.redactNonPublicEvidenceForExport(exportDir);
  const validation = await fsPackage.validateDataRoot(exportDir);
  if (!validation.ok) {
    throw new Error(validation.errors.join('\n'));
  }

  await cp(
    resolve(repoRoot, 'LICENSE-DATA.md'),
    resolve(exportDir, 'LICENSE-DATA.md'),
  );
  const manifest = await fsPackage.buildManifest(exportDir);
  await writeFile(
    resolve(exportDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    resolve(exportDir, 'index.html'),
    fsPackage.renderPagesIndex(manifest, {
      includeArchiveLinks: true,
      includeFixtureExportLinks: options.includeFixtureExportLinks ?? false,
    }),
  );
  await createArchives(exportDir);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage().trimEnd());
    return;
  }
  await generateFixtures({ dataDir: options.fixtureDataDir });
  assertArtifactPaths(options);

  const fsPackage = await loadFsPackage();

  await rm(options.outDir, { recursive: true, force: true });
  await mkdir(options.outDir, { recursive: true });
  await writeFile(resolve(options.outDir, '.nojekyll'), '');
  await buildDataExport(options.dataDir, options.outDir, fsPackage, {
    includeFixtureExportLinks: true,
  });
  await buildDataExport(
    options.fixtureDataDir,
    resolve(options.outDir, 'fixtures'),
    fsPackage,
  );

  console.log(`Built Pages artifact at ${options.outDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
