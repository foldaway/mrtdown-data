import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const entryDocs = [
  'AGENTS.md',
  'README.md',
  'CLAUDE.md',
  '.github/copilot-instructions.md',
];

function collectMarkdownDocs(dir, prefix = '') {
  const docs = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = resolve(dir, entry.name);

    if (entry.isDirectory()) {
      docs.push(...collectMarkdownDocs(absolutePath, relativePath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      docs.push(`docs/${relativePath}`);
    }
  }

  return docs;
}

const docs = [...entryDocs, ...collectMarkdownDocs(resolve(repoRoot, 'docs'))];

const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
const errors = [];

function isExternal(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#');
}

for (const doc of docs) {
  const path = resolve(repoRoot, doc);
  if (!existsSync(path)) {
    errors.push(`${doc}: expected documentation file is missing`);
    continue;
  }

  const text = await import('node:fs').then(({ readFileSync }) =>
    readFileSync(path, 'utf8'),
  );

  for (const match of text.matchAll(linkPattern)) {
    const rawTarget = match[1];
    if (!rawTarget || isExternal(rawTarget)) {
      continue;
    }

    const target = rawTarget.split('#')[0];
    if (!target || target.includes('*') || target.includes('{')) {
      continue;
    }

    const resolved = resolve(dirname(path), target);
    if (!resolved.startsWith(repoRoot) || !existsSync(resolved)) {
      errors.push(`${doc}: missing linked path ${rawTarget}`);
      continue;
    }

    if (!statSync(resolved).isFile() && !statSync(resolved).isDirectory()) {
      errors.push(
        `${doc}: linked path is not a file or directory ${rawTarget}`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error('Documentation link check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Documentation links are valid.');
