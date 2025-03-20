import { ComponentModel } from '../model/ComponentModel';

const REGEX_PHRASE_MATCHES =
  /(additional travel time|regular svc|travel time|additional travell?ing time)/i;

const componentIds = ComponentModel.getAllIds();
const wordMatches = new Set(
  [...componentIds, 'MRT', 'LRT', 'train', 'track', 'line', 'fault'].map(
    (word) => word.toLowerCase(),
  ),
);

export function isTextRailRelated(text: string): boolean {
  const wordSegmenter = new Intl.Segmenter('en-US', { granularity: 'word' });
  const wordSegments = Array.from(wordSegmenter.segment(text));

  for (const wordSegment of wordSegments) {
    if (wordMatches.has(wordSegment.segment.toLowerCase())) {
      return true;
    }
  }

  return REGEX_PHRASE_MATCHES.test(text);
}
