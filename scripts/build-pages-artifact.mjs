import { execFile } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
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
    [--gtfs-file <ZIP> --gtfs-capture <JSON> --gtfs-config <JSON>]

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

    const key = {
      '--data-dir': 'dataDir',
      '--out-dir': 'outDir',
      '--gtfs-file': 'gtfsFile',
      '--gtfs-capture': 'gtfsCapture',
      '--gtfs-config': 'gtfsConfig',
    }[arg];
    if (!key) {
      throw new Error(`Unknown option: ${arg}`);
    }

    const value = args.shift();
    if (!value || value.startsWith('--')) {
      throw new Error(`${arg} requires a value`);
    }

    options[key] = resolve(repoRoot, value);
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
  return firstSegment === 'source' || firstSegment === 'scheduled-timetable';
}

async function exportTimetable(exportDir, fsPackage, options) {
  const { runCli } = await import('../packages/cli/dist/index.js');
  const output = [],
    errors = [];
  const bundleDir = resolve(exportDir, '..', 'scheduled-timetable');
  const exitCode = await runCli(
    [
      '--data-dir',
      exportDir,
      'gtfs',
      'release',
      '--file',
      options.gtfsFile,
      '--capture',
      options.gtfsCapture,
      '--config',
      options.gtfsConfig,
      '--out',
      bundleDir,
    ],
    {
      stdout: (text) => output.push(text),
      stderr: (text) => errors.push(text),
    },
  );
  if (exitCode !== 0) {
    const blockers = output.length
      ? JSON.parse(output[0]).release.blockers
      : errors;
    throw new Error(`Timetable publication blocked: ${blockers.join('; ')}`);
  }
  const report = JSON.parse(output[0]);
  if (!report.exported || !report.release.eligible) {
    throw new Error('Timetable publication did not produce an eligible bundle');
  }
  const manifestBytes = await readFile(resolve(bundleDir, 'manifest.json'));
  if (fsPackage.hashBytes(manifestBytes) !== report.manifestSha256) {
    throw new Error('Timetable manifest changed after export');
  }
  const { capture, feedRange, currentLicenceReference } = JSON.parse(
    manifestBytes.toString('utf8'),
  );
  const { sourceTripDateCount, assignedTripDateCount, missingTripDateCount } =
    report.coverage;
  const entry = {
    manifestSha256: report.manifestSha256,
    releaseSha256: fsPackage.hashBytes(
      await readFile(resolve(bundleDir, 'release.json')),
    ),
    capture,
    feedRange,
    currentLicenceReference,
    coverage: {
      sourceTripDateCount,
      assignedTripDateCount,
      missingTripDateCount,
    },
  };
  await rename(bundleDir, resolve(exportDir, 'scheduled-timetable'));
  return entry;
}

async function assertTimetableInputPaths(options) {
  const config = JSON.parse(await readFile(options.gtfsConfig, 'utf8'));
  const inputs = [options.gtfsFile, options.gtfsCapture, options.gtfsConfig];
  for (const field of ['draft', 'mappingApproval', 'releaseReview']) {
    if (typeof config?.[field] === 'string') {
      inputs.push(resolve(dirname(options.gtfsConfig), config[field]));
    }
  }
  for (const input of inputs) {
    if (input === options.outDir || isSubpath(options.outDir, input)) {
      throw new Error('--out-dir must not contain timetable inputs');
    }
  }
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
  if (options.gtfsConfig) {
    manifest.scheduledTimetable = await exportTimetable(
      exportDir,
      fsPackage,
      options,
    );
  }
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

export async function buildPagesArtifact(options) {
  assertArtifactPaths(options);
  const gtfsInputs = [
    options.gtfsFile,
    options.gtfsCapture,
    options.gtfsConfig,
  ];
  if (gtfsInputs.some(Boolean) && !gtfsInputs.every(Boolean)) {
    throw new Error(
      'Use --gtfs-file, --gtfs-capture and --gtfs-config together',
    );
  }
  if (options.gtfsConfig) {
    await assertTimetableInputPaths(options);
  }
  const fsPackage = await loadFsPackage();
  await mkdir(dirname(options.outDir), { recursive: true });
  const stage = await mkdtemp(
    resolve(dirname(options.outDir), '.pages-build-'),
  );
  const exportDir = resolve(stage, 'data');
  try {
    await mkdir(exportDir);
    await writeFile(resolve(exportDir, '.nojekyll'), '');
    await buildDataExport(options.dataDir, exportDir, fsPackage, {
      ...options,
      includeFixtureExportLinks: true,
    });
    await buildDataExport(
      options.fixtureDataDir,
      resolve(exportDir, 'fixtures'),
      fsPackage,
    );
    await rm(options.outDir, { recursive: true, force: true });
    await rename(exportDir, options.outDir);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage().trimEnd());
    return;
  }
  await generateFixtures({ dataDir: options.fixtureDataDir });
  await buildPagesArtifact(options);
  console.log(`Built Pages artifact at ${options.outDir}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
