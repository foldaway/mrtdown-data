#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const monthByName = new Map([
  ['Jan', '01'],
  ['Feb', '02'],
  ['Mar', '03'],
  ['Apr', '04'],
  ['May', '05'],
  ['Jun', '06'],
  ['Jul', '07'],
  ['Aug', '08'],
  ['Sep', '09'],
  ['Oct', '10'],
  ['Nov', '11'],
  ['Dec', '12'],
]);

const mapComponentDir = join('app', 'components', 'StationMap', 'components');

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    siteDir: resolve(process.cwd(), '..', 'mrtdown-site'),
    write: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--site-dir') {
      const value = args[index + 1];
      if (!value) {
        throw new Error('--site-dir requires a value');
      }
      options.siteDir = resolve(process.cwd(), value);
      args.splice(index, 2);
      index -= 1;
      continue;
    }

    if (arg === '--write') {
      const value = args[index + 1];
      if (!value) {
        throw new Error('--write requires a value');
      }
      options.write = resolve(process.cwd(), value);
      args.splice(index, 2);
      index -= 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      return { ...options, help: true };
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function usage() {
  return `Usage:
  node scripts/schematic-map-inventory.mjs [--site-dir <path>] [--write <path>]

Reads mrtdown-site hard-coded StationMap Map*.tsx snapshots and emits a compact
JSON inventory for schematic map generator planning.`;
}

function componentEffectiveDate(componentName) {
  const match = /^Map([A-Z][a-z]{2})(\d{4})$/.exec(componentName);
  if (!match) {
    throw new Error(`Cannot derive effective date from ${componentName}`);
  }

  const [, monthName, year] = match;
  const month = monthByName.get(monthName);
  if (!month) {
    throw new Error(`Unknown map month in ${componentName}`);
  }

  return `${year}-${month}`;
}

function parseAttributes(source) {
  const attrs = {};
  for (const match of source.matchAll(
    /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g,
  )) {
    const [, name, doubleQuoted, singleQuoted, expression] = match;
    attrs[name] = doubleQuoted ?? singleQuoted ?? expression ?? '';
  }
  return attrs;
}

function findRootGroup(stack) {
  return stack.find((entry) => entry.id?.startsWith('System Map '));
}

function sortUnique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function lineSegmentStations(id) {
  const match = /^line_([a-z0-9]+):([a-z0-9]+)$/.exec(id);
  if (!match) {
    return [];
  }
  return [match[1].toUpperCase(), match[2].toUpperCase()];
}

function summarizeTags(source) {
  const stack = [];
  const ids = [];
  const tagCounts = new Map();
  const layerOrder = [];
  const lineSegmentIds = [];
  const lineGroupIds = [];
  const stationLabelIds = [];
  const stationNodeIds = [];
  const stationCodeIds = [];
  const stationIds = [];
  const rawGeometryIds = [];
  const textIds = [];
  let rootGroupDepth;

  const tagPattern = /<\/?([A-Za-z][\w:.]*)\b([^<>]*?)(\/?)>/gs;
  for (const match of source.matchAll(tagPattern)) {
    const [tagSource, tagName, attrSource, selfClosing] = match;
    if (tagName === 'SVGSVGElement') {
      continue;
    }

    if (tagSource.startsWith('</')) {
      while (stack.length > 0) {
        const popped = stack.pop();
        if (popped.tagName === tagName) {
          break;
        }
      }
      continue;
    }

    const attrs = parseAttributes(attrSource);
    const id = attrs.id;
    const rootGroup = findRootGroup(stack);
    tagCounts.set(tagName, (tagCounts.get(tagName) ?? 0) + 1);

    if (id) {
      ids.push(id);

      if (id.startsWith('line_')) {
        if (tagName === 'g') {
          lineGroupIds.push(id);
        } else {
          lineSegmentIds.push(id);
          stationIds.push(...lineSegmentStations(id));
        }
      } else if (id.startsWith('label_')) {
        stationLabelIds.push(id);
        stationIds.push(id.slice('label_'.length).toUpperCase());
      } else if (id.startsWith('node_')) {
        stationNodeIds.push(id);
        stationIds.push(id.slice('node_'.length).toUpperCase());
      } else if (
        /^(BP|CC|CE|CG|DT|EW|JS|JW|JE|NE|NS|PE|PW|SE|SW|TE)\s/.test(id)
      ) {
        stationCodeIds.push(id);
      }

      if (tagName === 'path' && attrs.d) {
        rawGeometryIds.push(id);
      }

      if (tagName === 'text') {
        textIds.push(id);
      }

      if (rootGroup && stack.length === rootGroupDepth) {
        layerOrder.push(id);
      }
    }

    if (id?.startsWith('System Map ')) {
      rootGroupDepth = stack.length + 1;
    }

    if (!selfClosing && !tagSource.endsWith('/>')) {
      stack.push({ tagName, id });
    }
  }

  return {
    counts: {
      ids: ids.length,
      uniqueIds: new Set(ids).size,
      duplicateIds: ids.length - new Set(ids).size,
      tags: Object.fromEntries([...tagCounts.entries()].sort()),
      lineGroups: new Set(lineGroupIds).size,
      lineSegments: new Set(lineSegmentIds).size,
      stationLabels: new Set(stationLabelIds).size,
      stationNodes: new Set(stationNodeIds).size,
      stationCodes: new Set(stationCodeIds).size,
      stationIds: new Set(stationIds).size,
      rawPathGeometry: new Set(rawGeometryIds).size,
      textElementsWithIds: new Set(textIds).size,
    },
    layerOrder,
    lineGroupIds: sortUnique(lineGroupIds),
    lineSegmentIds: sortUnique(lineSegmentIds),
    stationLabelIds: sortUnique(stationLabelIds),
    stationNodeIds: sortUnique(stationNodeIds),
    stationCodeIds: sortUnique(stationCodeIds),
    stationIds: sortUnique(stationIds),
    rawGeometryIds: sortUnique(rawGeometryIds),
  };
}

async function readMapFile(path, siteDir) {
  const source = await readFile(path, 'utf8');
  const componentName = path.match(/(Map[A-Za-z0-9]+)\.tsx$/)?.[1];
  if (!componentName) {
    throw new Error(`Cannot derive component name from ${path}`);
  }

  const viewBox = source.match(/viewBox="([^"]+)"/)?.[1] ?? null;
  const rootGroupId =
    source.match(/<g\s+id="(System Map \([^)]+\))"/)?.[1] ?? null;
  const summary = summarizeTags(source);

  return {
    effectiveDate: componentEffectiveDate(componentName),
    componentName,
    sourcePath: relative(siteDir, path),
    viewBox,
    rootGroupId,
    lineCount: source.split('\n').length - (source.endsWith('\n') ? 1 : 0),
    ...summary,
  };
}

async function buildInventory(siteDir) {
  const mapDir = join(siteDir, mapComponentDir);
  const entries = await readdir(mapDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => /^Map[A-Za-z0-9]+\.tsx$/.test(entry.name))
    .map((entry) => join(mapDir, entry.name));

  const maps = await Promise.all(
    files.map((file) => readMapFile(file, siteDir)),
  );
  maps.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

  const firstTarget = maps.find((map) => map.effectiveDate === '2025-04');

  return {
    generatedAt: new Date(0).toISOString(),
    sourceRepositoryPath: relative(process.cwd(), siteDir) || '.',
    mapComponentDir,
    firstTargetEffectiveDate: firstTarget?.effectiveDate ?? null,
    maps,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const inventory = await buildInventory(options.siteDir);
  const json = `${JSON.stringify(inventory, null, 2)}\n`;

  if (options.write) {
    await mkdir(dirname(options.write), { recursive: true });
    await writeFile(options.write, json);
    console.log(relative(process.cwd(), options.write));
    return;
  }

  console.log(json.trimEnd());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
