import type { IngestContent } from '../types.js';

export function formatContentTextForIngest(content: IngestContent): string {
  switch (content.source) {
    case 'reddit': {
      return formatFields([
        ['Title', content.title],
        ['Body', content.selftext],
      ]);
    }
    case 'news-website': {
      return formatFields([
        ['Title', content.title],
        ['Summary', content.summary],
      ]);
    }
    case 'twitter':
    case 'mastodon': {
      return content.text;
    }
    default: {
      const exhaustive: never = content;
      throw new Error(
        `Unhandled content source: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

function formatFields(fields: [label: string, value: string][]): string {
  return fields
    .map(([label, value]) => {
      const trimmed = value.trim();
      return trimmed.length > 0 ? `${label}: ${trimmed}` : null;
    })
    .filter((value): value is string => value != null)
    .join('\n\n');
}
