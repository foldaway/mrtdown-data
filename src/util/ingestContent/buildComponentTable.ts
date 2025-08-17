import { toMarkdown } from 'mdast-util-to-markdown';
import { ComponentModel } from '../../model/ComponentModel.js';
import type { Root, Table } from 'mdast';
import { gfmToMarkdown } from 'mdast-util-gfm';

export function buildComponentTable() {
  const components = ComponentModel.getAll();

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

  for (const component of components) {
    table.children.push({
      type: 'tableRow',
      children: [
        {
          type: 'tableCell',
          children: [
            {
              type: 'text',
              value: component.id,
            },
          ],
        },
        {
          type: 'tableCell',
          children: [
            {
              type: 'text',
              value: component.title,
            },
          ],
        },
        {
          type: 'tableCell',
          children: [
            {
              type: 'text',
              value: component.startedAt,
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
