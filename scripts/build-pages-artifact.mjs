import { execFile } from 'node:child_process';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { toHtml } from 'hast-util-to-html';

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
  const generatedAt = new Date();
  const text = (value) => ({ type: 'text', value });
  const element = (tagName, children = [], properties = {}) => ({
    type: 'element',
    tagName,
    properties,
    children,
  });
  const link = (href, label = href) => element('a', [text(label)], { href });
  const fileRow = (href, description) =>
    element('tr', [
      element('td', [link(href)]),
      element('td', [text(description)]),
    ]);

  return toHtml({
    type: 'root',
    children: [
      { type: 'doctype' },
      element(
        'html',
        [
          element('head', [
            element('meta', [], { charset: 'utf-8' }),
            element('meta', [], {
              name: 'viewport',
              content: 'width=device-width, initial-scale=1',
            }),
            element('title', [text('mrtdown-data')]),
            element('style', [
              text(
                `
:root { font-family: system-ui, sans-serif; line-height: 1.5; }
body { max-width: 40rem; margin: 2rem auto; padding: 0 1rem; color: #111; }
h1 { font-size: 1.5rem; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid #ddd; }
th { font-weight: 600; width: 40%; }
footer { margin-top: 2rem; font-size: 0.875rem; color: #555; }
a { color: #0b57d0; }`.trim(),
              ),
            ]),
          ]),
          element('body', [
            element('h1', [text('mrtdown-data')]),
            element('p', [
              text(
                'This split branch publishes only the deterministic fixture export. The canonical data export will be added after the target-layout data migration lands.',
              ),
            ]),
            element('p', [
              text('The fixture data index is available as '),
              link('fixtures/'),
              text('. Its machine-readable manifest is published as '),
              link('fixtures/manifest.json'),
              text('. The fixture directory is also available as '),
              link('fixtures/archive.tar.gz'),
              text(' (gzipped tarball) or '),
              link('fixtures/archive.zip'),
              text('.'),
            ]),
            link(
              'https://github.com/foldaway/mrtdown-data',
              'GitHub repository',
            ),
            element('h2', [text('Developer files')]),
            element('table', [
              element('tbody', [
                element('tr', [
                  element('th', [text('File')]),
                  element('th', [text('Description')]),
                ]),
                fileRow('fixtures/', 'Fixture data index.'),
                fileRow('fixtures/manifest.json', 'Fixture export manifest.'),
                fileRow(
                  'fixtures/archive.tar.gz',
                  'Fixture export as a gzipped tarball.',
                ),
                fileRow(
                  'fixtures/archive.zip',
                  'Fixture export as a ZIP archive.',
                ),
              ]),
            ]),
            element('footer', [
              text('Generated at '),
              element('time', [text(generatedAt.toUTCString())], {
                datetime: generatedAt.toISOString(),
              }),
              text(` (UTC) on ${process.platform}/${process.arch}`),
            ]),
          ]),
        ],
        { lang: 'en' },
      ),
    ],
  });
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
    fsPackage.renderPagesIndex(manifest, { includeArchiveLinks: true }),
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
