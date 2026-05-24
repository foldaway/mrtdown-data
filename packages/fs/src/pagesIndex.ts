import type { Manifest } from '@mrtdown/core';
import type { Element, Root } from 'hast';
import { toHtml } from 'hast-util-to-html';

export type PagesIndexOptions = {
  includeArchiveLinks?: boolean;
  includeFixtureExportLinks?: boolean;
};

export type PagesRootIndexOptions = {
  generatedAt?: Date;
};

type Child = Element['children'][number];

type FileLinkRow = {
  href: string;
  description: string;
};

type TableOfContentsItem = {
  href: string;
  label: string;
  count?: number;
};

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
h2 { margin-top: 2rem; }
nav ul { padding-left: 1.25rem; }
nav li { margin: 0.2rem 0; }
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

function paragraph(children: Child[]): Element {
  return {
    type: 'element',
    tagName: 'p',
    properties: {},
    children,
  };
}

function buildRepositoryParagraph(): Element {
  return paragraph([
    {
      type: 'text',
      value: 'Source data and package code are maintained in the ',
    },
    linkElement(
      'https://github.com/foldaway/mrtdown-data',
      'GitHub repository',
    ),
    { type: 'text', value: '.' },
  ]);
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

function issuePathFromManifestId(id: string): string {
  const [year, month] = id.split('-');
  return `issue/${year}/${month}/${id}/issue.json`;
}

function buildTable(
  title: string,
  id: string,
  records: Record<string, string>,
  pathForId: (id: string) => string,
): Element[] {
  const rows = Object.keys(records).map((id) => {
    const path = pathForId(id);

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
      properties: { id },
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

function buildTableOfContents(items: TableOfContentsItem[]): Element[] {
  return [
    {
      type: 'element',
      tagName: 'h2',
      properties: { id: 'contents' },
      children: [{ type: 'text', value: 'Contents' }],
    },
    {
      type: 'element',
      tagName: 'nav',
      properties: { ariaLabel: 'Table of contents' },
      children: [
        {
          type: 'element',
          tagName: 'ul',
          properties: {},
          children: items.map((item) => ({
            type: 'element',
            tagName: 'li',
            properties: {},
            children: [
              linkElement(item.href, item.label),
              ...(item.count === undefined
                ? []
                : [
                    {
                      type: 'text',
                      value: ` (${item.count})`,
                    } satisfies Child,
                  ]),
            ],
          })),
        },
      ],
    },
  ];
}

function buildFileRow(row: FileLinkRow): Element {
  return {
    type: 'element',
    tagName: 'tr',
    properties: {},
    children: [
      {
        type: 'element',
        tagName: 'td',
        properties: {},
        children: [linkElement(row.href)],
      },
      {
        type: 'element',
        tagName: 'td',
        properties: {},
        children: [{ type: 'text', value: row.description }],
      },
    ],
  };
}

function buildFilesTable(
  title: string,
  id: string,
  rows: FileLinkRow[],
): Element[] {
  return [
    {
      type: 'element',
      tagName: 'h2',
      properties: { id },
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
            ...rows.map(buildFileRow),
          ],
        },
      ],
    },
  ];
}

function buildExportRows(options: PagesIndexOptions): FileLinkRow[] {
  const rows: FileLinkRow[] = [
    {
      href: 'manifest.json',
      description: 'Machine-readable export manifest.',
    },
  ];

  if (options.includeArchiveLinks) {
    rows.push(
      {
        href: 'archive.tar.gz',
        description: 'Full data directory as a gzipped tarball.',
      },
      {
        href: 'archive.zip',
        description: 'Full data directory as a ZIP archive.',
      },
    );
  }

  if (options.includeFixtureExportLinks) {
    rows.push({
      href: 'fixtures/',
      description: 'Deterministic fixture export for package and CLI examples.',
    });
  }

  return rows;
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
      paragraph([
        {
          type: 'text',
          value:
            'Static canonical target-layout data for Singapore MRT/LRT status and history is published at this root. A deterministic fixture export is also available for package and CLI examples.',
        },
      ]),
      buildRepositoryParagraph(),
      ...buildTableOfContents([
        { href: '#developer-files', label: 'Developer files' },
      ]),
      ...buildFilesTable('Developer files', 'developer-files', [
        { href: 'manifest.json', description: 'Canonical export manifest.' },
        {
          href: 'archive.tar.gz',
          description: 'Canonical export as a gzipped tarball.',
        },
        {
          href: 'archive.zip',
          description: 'Canonical export as a ZIP archive.',
        },
        { href: 'fixtures/', description: 'Fixture data index.' },
        {
          href: 'fixtures/manifest.json',
          description: 'Fixture export manifest.',
        },
        {
          href: 'fixtures/archive.tar.gz',
          description: 'Fixture export as a gzipped tarball.',
        },
        {
          href: 'fixtures/archive.zip',
          description: 'Fixture export as a ZIP archive.',
        },
      ]),
      buildFooter(generatedAt),
    ]),
  );
}

export function renderPagesIndex(
  manifest: Manifest,
  options: PagesIndexOptions = {},
): string {
  const sections = [
    {
      id: 'lines',
      title: 'Lines',
      records: manifest.lines,
      pathForId: (id: string) => `line/${id}.json`,
    },
    {
      id: 'towns',
      title: 'Towns',
      records: manifest.towns,
      pathForId: (id: string) => `town/${id}.json`,
    },
    {
      id: 'landmarks',
      title: 'Landmarks',
      records: manifest.landmarks,
      pathForId: (id: string) => `landmark/${id}.json`,
    },
    {
      id: 'operators',
      title: 'Operators',
      records: manifest.operators,
      pathForId: (id: string) => `operator/${id}.json`,
    },
    {
      id: 'services',
      title: 'Services',
      records: manifest.services,
      pathForId: (id: string) => `service/${id}.json`,
    },
    {
      id: 'stations',
      title: 'Stations',
      records: manifest.stations,
      pathForId: (id: string) => `station/${id}.json`,
    },
    {
      id: 'issues',
      title: 'Issues',
      records: manifest.issues,
      pathForId: issuePathFromManifestId,
    },
  ];
  const tables = sections.flatMap((section) =>
    buildTable(section.title, section.id, section.records, section.pathForId),
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
        paragraph([
          {
            type: 'text',
            value:
              'Static canonical target-layout data for Singapore MRT/LRT status and history. Records are listed in alphabetical order by ID.',
          },
        ]),
        buildRepositoryParagraph(),
        ...buildTableOfContents([
          { href: '#exports', label: 'Exports' },
          ...sections.map((section) => ({
            href: `#${section.id}`,
            label: section.title,
            count: Object.keys(section.records).length,
          })),
        ]),
        ...buildFilesTable('Exports', 'exports', buildExportRows(options)),
        ...tables,
        buildFooter(generatedAt, manifest.generatedAt),
      ],
      { includeCodeStyle: true },
    ),
  );
}
