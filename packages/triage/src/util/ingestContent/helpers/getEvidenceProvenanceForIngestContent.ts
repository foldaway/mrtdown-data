import { type EvidenceType, EvidenceTypeSchema } from '@mrtdown/core';
import type { IngestContent } from '../types.js';

export interface IngestContentEvidenceProvenance {
  type: EvidenceType;
  sourceUrl: string;
}

export function getEvidenceProvenanceForIngestContent(
  content: IngestContent,
): IngestContentEvidenceProvenance {
  return {
    type: getEvidenceTypeForIngestContent(content),
    sourceUrl: content.url,
  };
}

function getEvidenceTypeForIngestContent(content: IngestContent): EvidenceType {
  switch (content.source) {
    case 'reddit':
    case 'twitter':
    case 'mastodon':
    case 'crowd-report': {
      return EvidenceTypeSchema.enum['report.public'];
    }
    case 'news-website': {
      return EvidenceTypeSchema.enum['report.media'];
    }
    default: {
      const exhaustive: never = content;
      throw new Error(
        `Unhandled content source: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}
