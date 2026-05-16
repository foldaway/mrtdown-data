import type { Manifest } from '@mrtdown/core';
import type { Element, Root } from 'hast';
import { toHtml } from 'hast-util-to-html';

export type PagesIndexOptions = {
  includeArchiveLinks?: boolean;
};

type Child = Element['children'][number];

function text(value: string): Child {
  return { type: 'text', value };
}

function element(
  tagName: string,
  children: Child[] = [],
  properties: Element['properties'] = {},
): Element {
  return {
    type: 'element',
    tagName,
    properties,
    children,
  };
}

function link(href: string, label = href): Element {
  return element('a', [text(label)], { href });
}

function code(value: string): Element {
  return element('pre', [text(value)]);
}

function buildExportLinks(options: PagesIndexOptions): Element {
  const children: Child[] = [
    text(
      'Static data index for Singapore MRT/LRT status and history. The machine-readable manifest is published as ',
    ),
    link('manifest.json'),
    text('.'),
  ];

  if (options.includeArchiveLinks) {
    children.push(
      text(' The full data directory is also available as '),
      link('archive.tar.gz'),
      text(' (gzipped tarball) or '),
      link('archive.zip'),
      text('.'),
    );
  }

  children.push(text(' Records are listed in alphabetical order by ID.'));
  return element('p', children);
}

function buildTable(title: string, records: Record<string, string>): Element[] {
  const rows = Object.entries(records).map(([id, path]) =>
    element('tr', [element('td', [code(id)]), element('td', [link(path)])]),
  );

  return [
    element('h2', [text(title)]),
    element('table', [
      element('tbody', [
        element('tr', [
          element('th', [text('ID')]),
          element('th', [text('Link')]),
        ]),
        ...rows,
      ]),
    ]),
  ];
}

export function renderPagesIndex(
  manifest: Manifest,
  options: PagesIndexOptions = {},
): string {
  const sections = [
    ['Lines', manifest.lines],
    ['Towns', manifest.towns],
    ['Landmarks', manifest.landmarks],
    ['Operators', manifest.operators],
    ['Services', manifest.services],
    ['Stations', manifest.stations],
    ['Issues', manifest.issues],
  ] satisfies Array<[string, Record<string, string>]>;
  const tables = sections.flatMap(([title, records]) =>
    buildTable(title, records),
  );
  const generatedAt = new Date(manifest.generatedAt);
  const root: Root = {
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
pre { word-break: break-word; white-space: pre-wrap; display: inline; background-color: #f0f0f0; padding: 0.125rem 0.25rem; border-radius: 0.25rem; }
footer { margin-top: 2rem; font-size: 0.875rem; color: #555; }
a { color: #0b57d0; }`.trim(),
              ),
            ]),
          ]),
          element('body', [
            element('h1', [text('mrtdown-data')]),
            buildExportLinks(options),
            link(
              'https://github.com/foldaway/mrtdown-data',
              'GitHub repository',
            ),
            ...tables,
            element('footer', [
              text('Generated at '),
              element('time', [text(generatedAt.toUTCString())], {
                datetime: manifest.generatedAt,
              }),
              text(` (UTC) on ${process.platform}/${process.arch}`),
            ]),
          ]),
        ],
        { lang: 'en' },
      ),
    ],
  };

  return toHtml(root);
}
