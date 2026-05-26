import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FileStore, MRTDownRepository } from '@mrtdown/fs';
import { config as loadDotEnv } from 'dotenv';
import { DateTime } from 'luxon';
import { describe } from 'vitest';
import { describeEval, StructuredOutputScorer } from 'vitest-evals';
import {
  type TriageNewEvidenceParams,
  type TriageNewEvidenceResult,
  triageNewEvidence,
} from './index.js';

loadDotEnv({
  path: resolve(import.meta.dirname, '../../../../../../.env'),
});

const FIXTURE_DATA_DIR = resolve(
  process.env.MRTDOWN_FIXTURE_DATA_DIR ??
    resolve(import.meta.dirname, '../../../../../../fixtures/generated/data'),
);
const FIXTURE_META = JSON.parse(
  readFileSync(
    process.env.MRTDOWN_FIXTURE_META_PATH ??
      resolve(
        import.meta.dirname,
        '../../../../../../fixtures/generated/meta.json',
      ),
    'utf8',
  ),
) as {
  issues: {
    trainFault: { id: string; timestamp: string };
  };
};

function addSecondsToIsoTimestamp(timestamp: string, seconds: number) {
  const isoTimestamp = DateTime.fromISO(timestamp, { setZone: true })
    .plus({ seconds })
    .toISO({ suppressMilliseconds: true });
  if (isoTimestamp == null) {
    throw new Error(`Could not format timestamp: ${timestamp}`);
  }
  return isoTimestamp;
}

const TRAIN_FAULT_FOLLOW_UP_TS = addSecondsToIsoTimestamp(
  FIXTURE_META.issues.trainFault.timestamp,
  10,
);

describe('triageNewEvidence', () => {
  describeEval(
    'should triage the new evidence into an existing issue or a new issue',
    {
      // @ts-expect-error input is a string in the vitest-evals library
      async data() {
        const store = new FileStore(FIXTURE_DATA_DIR);
        const repo = new MRTDownRepository({ store });

        return [
          {
            input: {
              newEvidence: {
                ts: TRAIN_FAULT_FOLLOW_UP_TS,
                text: '[ISL] Due to a track fault at HKU, train services on the Island Line are delayed between Kennedy Town and Admiralty',
              },
              repo,
              // This is used by vitest-evals as the test name, as the library expects `input` to be a string.
              toString() {
                return '[DISRUPTION] Related to an existing issue';
              },
            },
            expected: {
              result: {
                kind: 'part-of-existing-issue',
                issueId: FIXTURE_META.issues.trainFault.id,
              },
            },
          },
          {
            input: {
              newEvidence: {
                ts: TRAIN_FAULT_FOLLOW_UP_TS,
                text: '[ISL] Due to a track fault at HKU, train services on the Island Line are delayed between Admiralty and Causeway Bay',
              },
              repo,
              // This is used by vitest-evals as the test name, as the library expects `input` to be a string.
              toString() {
                return '[DISRUPTION] Related to a new issue on a different part of the same line';
              },
            },
            expected: {
              result: {
                kind: 'part-of-new-issue',
                issueType: 'disruption',
              },
            },
          },
          {
            input: {
              newEvidence: {
                ts: TRAIN_FAULT_FOLLOW_UP_TS,
                text: '[ISL] Due to maintenance works, services on the Island Line will end earlier at 11pm tonight.',
              },
              repo,
              // This is used by vitest-evals as the test name, as the library expects `input` to be a string.
              toString() {
                return '[MAINTENANCE] Related to a new issue';
              },
            },
            expected: {
              result: {
                kind: 'part-of-new-issue',
                issueType: 'maintenance',
              },
            },
          },
          {
            input: {
              newEvidence: {
                ts: '2026-03-01T07:10:00+08:00',
                text: '[TWL] Due to a track fault at Mong Kok, train services on the Tsuen Wan Line are delayed between Tsuen Wan and Mong Kok',
              },
              repo: new MRTDownRepository({
                store: new FileStore(FIXTURE_DATA_DIR),
              }),
              // This is used by vitest-evals as the test name, as the library expects `input` to be a string.
              toString() {
                return '[DISRUPTION] Related to a new issue';
              },
            },
            expected: {
              result: {
                kind: 'part-of-new-issue',
                issueType: 'disruption',
              },
            },
          },
          {
            input: {
              newEvidence: {
                ts: '2026-03-01T07:10:00+08:00',
                text: '[TWL] Platform screen doors at Tsuen Wan Line stations will undergo renewal works from 1st March to 31st March 2026.',
              },
              repo,
              // This is used by vitest-evals as the test name, as the library expects `input` to be a string.
              toString() {
                return '[INFRA] Related to a new issue';
              },
            },
            expected: {
              result: {
                kind: 'part-of-new-issue',
                issueType: 'infra',
              },
            },
          },
          {
            input: {
              newEvidence: {
                ts: '2026-03-01T07:10:00+08:00',
                text: "Hong Kong's rail system is the best in the world.",
              },
              repo,
              // This is used by vitest-evals as the test name, as the library expects `input` to be a string.
              toString() {
                return 'Irrelevant content';
              },
            },
            expected: {
              result: {
                kind: 'irrelevant-content',
              },
            },
          },
          {
            input: {
              newEvidence: {
                ts: '2026-05-26T14:48:44+08:00',
                text: '14:23-Due to vehicle breakdown along Sims Avenue East, at the junction with Chai Chee Drive after bus stop BS 83081, bus service 26 is diverted.',
              },
              repo,
              // This is used by vitest-evals as the test name, as the library expects `input` to be a string.
              toString() {
                return 'Irrelevant bus-only service diversion';
              },
            },
            expected: {
              result: {
                kind: 'irrelevant-content',
              },
            },
          },
        ] satisfies {
          input: TriageNewEvidenceParams & { toString(): string };
          expected: TriageNewEvidenceResult;
        }[];
      },
      async task(input) {
        const result = await triageNewEvidence(
          input as unknown as TriageNewEvidenceParams,
        );
        return JSON.stringify(result);
      },
      scorers: [StructuredOutputScorer()],
    },
  );
});
