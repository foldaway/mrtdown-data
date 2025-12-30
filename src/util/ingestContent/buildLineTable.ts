import { toMarkdown } from 'mdast-util-to-markdown';
import { LineModel } from '../../model/LineModel.js';
import type { Root, Table } from 'mdast';
import { gfmToMarkdown } from 'mdast-util-gfm';

export function buildLineTable() {
  const lines = LineModel.getAll();

  const table: Table = {
    type: 'table',
    children: [
      {
        type: 'tableRow',
        children: [
          {
            type: 'tableCell',
            children: [
              {
                type: 'text',
                value: 'ID',
              },
            ],
          },
          {
            type: 'tableCell',
            children: [
              {
                type: 'text',
                value: 'Title',
              },
            ],
          },
          {
            type: 'tableCell',
            children: [
              {
                type: 'text',
                value: 'Started Operations At',
              },
            ],
          },
        ],
      },
    ],
  };

  for (const line of lines) {
    table.children.push({
      type: 'tableRow',
      children: [
        {
          type: 'tableCell',
          children: [
            {
              type: 'text',
              value: line.id,
            },
          ],
        },
        {
          type: 'tableCell',
          children: [
            {
              type: 'text',
              value: line.title,
            },
          ],
        },
        {
          type: 'tableCell',
          children: [
            {
              type: 'text',
              value: line.startedAt,
            },
          ],
        },
      ],
    });
  }

  const root: Root = {
    type: 'root',
    children: [table],
  };

  return toMarkdown(root, {
    extensions: [gfmToMarkdown()],
  });
}
