import type { Manifest } from '@mrtdown/core';
import type { Element, Root } from 'hast';
import { toHtml } from 'hast-util-to-html';

export type PagesIndexOptions = {
  includeArchiveLinks?: boolean;
};

export type PagesRootIndexOptions = {
  generatedAt?: Date;
};

type Child = Element['children'][number];

function linkElement(href: string, label = href): Element {
  return {
    type: 'element',
    tagName: 'a',
    properties: { href },
    children: [{ type: 'text', value: label }],
  };
}

function buildDocument(
  bodyChildren: Child[],
  options: { includeCodeStyle?: boolean } = {},
): Root {
  const codeStyle = options.includeCodeStyle
    ? 'pre { word-break: break-word; white-space: pre-wrap; display: inline; background-color: #f0f0f0; padding: 0.125rem 0.25rem; border-radius: 0.25rem; }'
    : '';

  return {
    type: 'root',
    children: [
      { type: 'doctype' },
      {
        type: 'element',
        tagName: 'html',
        properties: { lang: 'en' },
        children: [
          {
            type: 'element',
            tagName: 'head',
            properties: {},
            children: [
              {
                type: 'element',
                tagName: 'meta',
                properties: { charset: 'utf-8' },
                children: [],
              },
              {
                type: 'element',
                tagName: 'meta',
                properties: {
                  name: 'viewport',
                  content: 'width=device-width, initial-scale=1',
                },
                children: [],
              },
              {
                type: 'element',
                tagName: 'title',
                properties: {},
                children: [{ type: 'text', value: 'mrtdown-data' }],
              },
              {
                type: 'element',
                tagName: 'style',
                properties: {},
                children: [
                  {
                    type: 'text',
                    value: `
:root { font-family: system-ui, sans-serif; line-height: 1.5; }
body { max-width: 40rem; margin: 2rem auto; padding: 0 1rem; color: #111; }
h1 { font-size: 1.5rem; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid #ddd; }
th { font-weight: 600; width: 40%; }
${codeStyle}
footer { margin-top: 2rem; font-size: 0.875rem; color: #555; }
a { color: #0b57d0; }`.trim(),
                  },
                ],
              },
            ],
          },
          {
            type: 'element',
            tagName: 'body',
            properties: {},
            children: bodyChildren,
          },
        ],
      },
    ],
  };
}

function buildExportLinks(options: PagesIndexOptions): Element {
  const children: Child[] = [
    {
      type: 'text',
      value:
        'Static data index for Singapore MRT/LRT status and history. The machine-readable manifest is published as ',
    },
    linkElement('manifest.json'),
    { type: 'text', value: '.' },
  ];

  if (options.includeArchiveLinks) {
    children.push(
      { type: 'text', value: ' The full data directory is also available as ' },
      linkElement('archive.tar.gz'),
      { type: 'text', value: ' (gzipped tarball) or ' },
      linkElement('archive.zip'),
      { type: 'text', value: '.' },
    );
  }

  children.push({
    type: 'text',
    value: ' Records are listed in alphabetical order by ID.',
  });

  return {
    type: 'element',
    tagName: 'p',
    properties: {},
    children,
  };
}

function buildFooter(
  generatedAt: Date,
  datetime = generatedAt.toISOString(),
): Element {
  return {
    type: 'element',
    tagName: 'footer',
    properties: {},
    children: [
      { type: 'text', value: 'Generated at ' },
      {
        type: 'element',
        tagName: 'time',
        properties: { datetime },
        children: [{ type: 'text', value: generatedAt.toUTCString() }],
      },
      {
        type: 'text',
        value: ` (UTC) on ${process.platform}/${process.arch}`,
      },
    ],
  };
}

function buildTable(title: string, records: Record<string, string>): Element[] {
  const rows = Object.entries(records).map(([id, path]) => {
    return {
      type: 'element',
      tagName: 'tr',
      properties: {},
      children: [
        {
          type: 'element',
          tagName: 'td',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'pre',
              properties: {},
              children: [{ type: 'text', value: id }],
            },
          ],
        },
        {
          type: 'element',
          tagName: 'td',
          properties: {},
          children: [linkElement(path)],
        },
      ],
    } satisfies Element;
  });

  return [
    {
      type: 'element',
      tagName: 'h2',
      properties: {},
      children: [{ type: 'text', value: title }],
    },
    {
      type: 'element',
      tagName: 'table',
      properties: {},
      children: [
        {
          type: 'element',
          tagName: 'tbody',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'tr',
              properties: {},
              children: [
                {
                  type: 'element',
                  tagName: 'th',
                  properties: {},
                  children: [{ type: 'text', value: 'ID' }],
                },
                {
                  type: 'element',
                  tagName: 'th',
                  properties: {},
                  children: [{ type: 'text', value: 'Link' }],
                },
              ],
            },
            ...rows,
          ],
        },
      ],
    },
  ];
}

function buildFileRow(href: string, description: string): Element {
  return {
    type: 'element',
    tagName: 'tr',
    properties: {},
    children: [
      {
        type: 'element',
        tagName: 'td',
        properties: {},
        children: [linkElement(href)],
      },
      {
        type: 'element',
        tagName: 'td',
        properties: {},
        children: [{ type: 'text', value: description }],
      },
    ],
  };
}

export function renderPagesRootIndex(
  options: PagesRootIndexOptions = {},
): string {
  const generatedAt = options.generatedAt ?? new Date();

  return toHtml(
    buildDocument([
      {
        type: 'element',
        tagName: 'h1',
        properties: {},
        children: [{ type: 'text', value: 'mrtdown-data' }],
      },
      {
        type: 'element',
        tagName: 'p',
        properties: {},
        children: [
          {
            type: 'text',
            value:
              'This split branch publishes only the deterministic fixture export. The canonical data export will be added after the target-layout data migration lands.',
          },
        ],
      },
      {
        type: 'element',
        tagName: 'p',
        properties: {},
        children: [
          { type: 'text', value: 'The fixture data index is available as ' },
          linkElement('fixtures/'),
          {
            type: 'text',
            value: '. Its machine-readable manifest is published as ',
          },
          linkElement('fixtures/manifest.json'),
          {
            type: 'text',
            value: '. The fixture directory is also available as ',
          },
          linkElement('fixtures/archive.tar.gz'),
          { type: 'text', value: ' (gzipped tarball) or ' },
          linkElement('fixtures/archive.zip'),
          { type: 'text', value: '.' },
        ],
      },
      linkElement(
        'https://github.com/foldaway/mrtdown-data',
        'GitHub repository',
      ),
      {
        type: 'element',
        tagName: 'h2',
        properties: {},
        children: [{ type: 'text', value: 'Developer files' }],
      },
      {
        type: 'element',
        tagName: 'table',
        properties: {},
        children: [
          {
            type: 'element',
            tagName: 'tbody',
            properties: {},
            children: [
              {
                type: 'element',
                tagName: 'tr',
                properties: {},
                children: [
                  {
                    type: 'element',
                    tagName: 'th',
                    properties: {},
                    children: [{ type: 'text', value: 'File' }],
                  },
                  {
                    type: 'element',
                    tagName: 'th',
                    properties: {},
                    children: [{ type: 'text', value: 'Description' }],
                  },
                ],
              },
              buildFileRow('fixtures/', 'Fixture data index.'),
              buildFileRow(
                'fixtures/manifest.json',
                'Fixture export manifest.',
              ),
              buildFileRow(
                'fixtures/archive.tar.gz',
                'Fixture export as a gzipped tarball.',
              ),
              buildFileRow(
                'fixtures/archive.zip',
                'Fixture export as a ZIP archive.',
              ),
            ],
          },
        ],
      },
      buildFooter(generatedAt),
    ]),
  );
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

  return toHtml(
    buildDocument(
      [
        {
          type: 'element',
          tagName: 'h1',
          properties: {},
          children: [{ type: 'text', value: 'mrtdown-data' }],
        },
        buildExportLinks(options),
        linkElement(
          'https://github.com/foldaway/mrtdown-data',
          'GitHub repository',
        ),
        ...tables,
        buildFooter(generatedAt, manifest.generatedAt),
      ],
      { includeCodeStyle: true },
    ),
  );
}
