import { resolve } from 'node:path';
import { type Translations, TranslationsSchema } from '@mrtdown/core';
import { config as loadDotEnv } from 'dotenv';
import { describe } from 'vitest';
import { createHarness, createJudge, describeEval } from 'vitest-evals';
import { translate } from './index.js';

loadDotEnv({
  path: resolve(import.meta.dirname, '../../../../../../.env'),
});

type TranslateEvalExpected = {
  englishIncludes: string[];
};

type TranslateEvalMetadata = {
  expected: TranslateEvalExpected;
};

function parseTranslations(output: string): Translations | string {
  try {
    return TranslationsSchema.parse(JSON.parse(output));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function includesAll(haystack: string, needles: string[]) {
  const normalizedHaystack = haystack.toLocaleLowerCase();

  return needles.every((needle) =>
    normalizedHaystack.includes(needle.toLocaleLowerCase()),
  );
}

const TranslateQualityScorer = ({
  expected,
  output,
}: {
  expected: TranslateEvalExpected;
  output: string;
}) => {
  const parsed = parseTranslations(output);
  if (typeof parsed === 'string') {
    return {
      score: 0,
      metadata: {
        rationale: `Output is not valid Translations JSON: ${parsed}`,
        output,
      },
    };
  }

  const issues: string[] = [];
  const requiredLocales = [
    ['en-SG', parsed['en-SG']],
    ['zh-Hans', parsed['zh-Hans']],
    ['ms', parsed.ms],
    ['ta', parsed.ta],
  ] as const;

  for (const [locale, text] of requiredLocales) {
    if (text == null || text.trim().length === 0) {
      issues.push(`${locale} is empty`);
    }
  }

  if (!includesAll(parsed['en-SG'], expected.englishIncludes)) {
    issues.push(
      `en-SG is missing one of: ${expected.englishIncludes.join(', ')}`,
    );
  }

  if (
    parsed['zh-Hans'] != null &&
    !/[\u4E00-\u9FFF]/u.test(parsed['zh-Hans'])
  ) {
    issues.push('zh-Hans does not contain Chinese characters');
  }

  if (parsed.ta != null && !/[\u0B80-\u0BFF]/u.test(parsed.ta)) {
    issues.push('ta does not contain Tamil characters');
  }

  for (const [locale, translatedText] of [
    ['zh-Hans', parsed['zh-Hans']],
    ['ms', parsed.ms],
    ['ta', parsed.ta],
  ] as const) {
    if (translatedText != null && translatedText === parsed['en-SG']) {
      issues.push(`${locale} is identical to en-SG`);
    }
  }

  return {
    score: issues.length === 0 ? 1 : 0,
    metadata:
      issues.length === 0
        ? undefined
        : {
            rationale: issues.join('; '),
            output: parsed,
          },
  };
};

const translateHarness = createHarness<string, string, TranslateEvalMetadata>({
  name: 'translate',
  async run({ input }) {
    const result = await translate(input);
    return { output: JSON.stringify(result) };
  },
});

const TranslateQualityJudge = createJudge(
  'TranslateQualityJudge',
  ({ metadata, output }) =>
    TranslateQualityScorer({ expected: metadata.expected, output }),
);

describe('translate', () => {
  describeEval(
    'should translate transit issue text into render locales',
    {
      harness: translateHarness,
      judges: [TranslateQualityJudge],
    },
    (it) => {
      it.for([
        {
          name: 'Island Line delay near Admiralty',
          input: 'Island Line delay near Admiralty',
          expected: {
            englishIncludes: ['Island Line', 'delay', 'Admiralty'],
          },
        },
        {
          name: 'Island Line track fault',
          input:
            '[ISL] Due to a track fault at HKU, train services on the Island Line are delayed between Kennedy Town and Admiralty.',
          expected: {
            englishIncludes: ['track fault', 'Island Line', 'delayed'],
          },
        },
        {
          name: 'Platform screen door renewal works',
          input:
            'Platform screen doors at Tsuen Wan Line stations will undergo renewal works from 1 March to 31 March 2026.',
          expected: {
            englishIncludes: [
              'Platform screen doors',
              'Tsuen Wan Line',
              'renewal works',
            ],
          },
        },
      ] satisfies {
        name: string;
        input: string;
        expected: TranslateEvalExpected;
      }[])('$name', async ({ input, expected }, { run }) => {
        await run(input, { metadata: { expected } });
      });
    },
  );
});
