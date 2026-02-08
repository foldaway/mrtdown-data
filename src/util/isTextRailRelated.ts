import { LineModel } from '../model/LineModel.js';

const REGEX_PHRASE_MATCHES =
  /(additional travel time|regular svc|travel time|additional travell?ing time)/i;

const lineIds = LineModel.getAllIds();
const wordMatches = new Set(
  [...lineIds, 'MRT', 'LRT', 'train', 'track', 'line', 'fault'].map((word) =>
    word.toLowerCase(),
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
