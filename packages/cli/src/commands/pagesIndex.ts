import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DIR_ISSUE,
  DIR_LANDMARK,
  DIR_LINE,
  DIR_OPERATOR,
  DIR_SERVICE,
  DIR_STATION,
  DIR_TOWN,
  FileStore,
  type IssueRepository,
  MRTDownRepository,
  type StandardRepository,
  type StandardRepositoryItem,
} from '@mrtdown/fs';
import type { Element, Root } from 'hast';
import { toHtml } from 'hast-util-to-html';

export interface PagesIndexCliOptions {
  dataDir: string;
}

function buildTableForStandardRepository<T extends StandardRepositoryItem>(
  repo: StandardRepository<T>,
  nameFn: (item: T) => string,
  title: string,
  dir: string,
): Element[] {
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
              children: [{ type: 'text', value: 'Name' }],
            },
            {
              type: 'element',
              tagName: 'th',
              properties: {},
              children: [{ type: 'text', value: 'Link' }],
            },
          ],
        },
        ...repo.list().map((item) => {
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
                    properties: {
                      style:
                        'word-break: break-word; white-space: pre-wrap; display: inline; background-color: #f0f0f0; padding: 0.125rem 0.25rem; border-radius: 0.25rem;',
                    },
                    children: [{ type: 'text', value: item.id }],
                  },
                ],
              },
              {
                type: 'element',
                tagName: 'td',
                properties: {},
                children: [{ type: 'text', value: nameFn(item) }],
              },
              {
                type: 'element',
                tagName: 'td',
                properties: {},
                children: [
                  {
                    type: 'element',
                    tagName: 'a',
                    properties: { href: `${dir}/${item.id}.json` },
                    children: [{ type: 'text', value: `${item.id}.json` }],
                  },
                ],
              },
            ],
          } satisfies Element;
        }),
      ],
    },
  ];
}

function buildTableForIssueRepository(
  repo: IssueRepository,
  dir: string,
): Element[] {
  return [
    {
      type: 'element',
      tagName: 'h2',
      properties: {},
      children: [{ type: 'text', value: 'Issues' }],
    },
    {
      type: 'element',
      tagName: 'table',
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
              children: [{ type: 'text', value: 'Name' }],
            },
            {
              type: 'element',
              tagName: 'th',
              properties: {},
              children: [{ type: 'text', value: 'Link' }],
            },
          ],
        },
        ...repo.list().map((item) => {
          const [year, month] = item.issue.id.split('-');

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
                    properties: {
                      style:
                        'word-break: break-word; white-space: pre-wrap; display: inline; background-color: #f0f0f0; padding: 0.125rem 0.25rem; border-radius: 0.25rem;',
                    },
                    children: [{ type: 'text', value: item.issue.id }],
                  },
                ],
              },
              {
                type: 'element',
                tagName: 'td',
                properties: {},
                children: [{ type: 'text', value: item.issue.title['en-SG'] }],
              },
              {
                type: 'element',
                tagName: 'td',
                properties: {},
                children: [
                  {
                    type: 'element',
                    tagName: 'div',
                    properties: {
                      style:
                        'display: flex; flex-direction: column; gap: 0.5rem;',
                    },
                    children: [
                      {
                        type: 'element',
                        tagName: 'a',
                        properties: {
                          href: `${dir}/${year}/${month}/${item.issue.id}/issue.json`,
                        },
                        children: [
                          {
                            type: 'text',
                            value: 'issue.json',
                          },
                        ],
                      },
                      {
                        type: 'element',
                        tagName: 'a',
                        properties: {
                          href: `${dir}/${year}/${month}/${item.issue.id}/evidence.ndjson`,
                        },
                        children: [
                          {
                            type: 'text',
                            value: 'evidence.ndjson',
                          },
                        ],
                      },
                      {
                        type: 'element',
                        tagName: 'a',
                        properties: {
                          href: `${dir}/${year}/${month}/${item.issue.id}/impact.ndjson`,
                        },
                        children: [
                          {
                            type: 'text',
                            value: 'impact.ndjson',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          } satisfies Element;
        }),
      ],
    },
  ];
}

export function runPagesIndex(opts: PagesIndexCliOptions): number {
  const store = new FileStore(opts.dataDir);
  const repo = new MRTDownRepository({ store });

  const linesTable = buildTableForStandardRepository(
    repo.lines,
    (line) => line.name['en-SG'],
    'Lines',
    DIR_LINE,
  );

  const townsTable = buildTableForStandardRepository(
    repo.towns,
    (town) => town.name['en-SG'],
    'Towns',
    DIR_TOWN,
  );

  const landmarksTable = buildTableForStandardRepository(
    repo.landmarks,
    (landmark) => landmark.name['en-SG'],
    'Landmarks',
    DIR_LANDMARK,
  );

  const operatorsTable = buildTableForStandardRepository(
    repo.operators,
    (operator) => operator.name['en-SG'],
    'Operators',
    DIR_OPERATOR,
  );

  const servicesTable = buildTableForStandardRepository(
    repo.services,
    (service) => service.name['en-SG'],
    'Services',
    DIR_SERVICE,
  );

  const stationsTable = buildTableForStandardRepository(
    repo.stations,
    (station) => station.name['en-SG'],
    'Stations',
    DIR_STATION,
  );

  const issuesTable = buildTableForIssueRepository(repo.issues, DIR_ISSUE);

  const generatedAt = new Date();

  const root: Root = {
    type: 'root',
    children: [
      {
        type: 'doctype',
      },
      {
        type: 'element',
        tagName: 'html',
        properties: {
          lang: 'en',
        },
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
            children: [
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
                      'Static data index for Singapore MRT/LRT status and history. The machine-readable manifest is published as ',
                  },
                  {
                    type: 'element',
                    tagName: 'a',
                    properties: { href: 'manifest.json' },
                    children: [{ type: 'text', value: 'manifest.json' }],
                  },
                  {
                    type: 'text',
                    value:
                      '. The full data directory is also available as a gzipped tarball: ',
                  },
                  {
                    type: 'element',
                    tagName: 'a',
                    properties: { href: 'archive.tar.gz' },
                    children: [{ type: 'text', value: 'archive.tar.gz' }],
                  },
                  {
                    type: 'text',
                    value: '. Lines are listed in alphabetical order by ID.',
                  },
                ],
              },
              {
                type: 'element',
                tagName: 'a',
                properties: { href: 'https://github.com/mrtdown/mrtdown-data' },
                children: [{ type: 'text', value: 'GitHub repository' }],
              },
              ...linesTable,
              ...townsTable,
              ...landmarksTable,
              ...operatorsTable,
              ...servicesTable,
              ...stationsTable,
              ...issuesTable,
              {
                type: 'element',
                tagName: 'footer',
                properties: {},
                children: [
                  {
                    type: 'text',
                    value: `Generated at `,
                  },
                  {
                    type: 'element',
                    tagName: 'time',
                    properties: { datetime: generatedAt.toISOString() },
                    children: [
                      { type: 'text', value: generatedAt.toLocaleString() },
                    ],
                  },
                  {
                    type: 'text',
                    value: ` (UTC) on ${process.platform}/${process.arch}`,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const html = toHtml(root);

  const filePath = resolve(opts.dataDir, 'index.html');
  writeFileSync(filePath, html, 'utf-8');

  return 0;
}
