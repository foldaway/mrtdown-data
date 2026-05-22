import { resolve } from 'node:path';
import { FileStore, MRTDownRepository } from '@mrtdown/fs';
import { config as loadDotEnv } from 'dotenv';
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
  import.meta.dirname,
  '../../../../../../fixtures/data',
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
                ts: '2026-01-01T07:10:00+08:00',
                text: '[BTL] Due to a track fault at Beauty World, train services on the Bukit Timah Line are delayed between Bukit Panjang and King Albert Park',
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
                issueId: '2026-01-01-btl-train-fault',
              },
            },
          },
          {
            input: {
              newEvidence: {
                ts: '2026-01-01T07:10:00+08:00',
                text: '[BTL] Due to a track fault at Beauty World, train services on the Bukit Timah Line are delayed between King Albert Park and Rochor',
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
                ts: '2026-01-01T07:10:00+08:00',
                text: '[BTL] Due to maintenance works, services on the Bukit Timah Line will end earlier at 11pm tonight.',
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
                text: '[ERL] Due to a track fault at MacPherson, train services on the Eastern Region Line are delayed between Expo and MacPherson',
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
                text: '[ERL] MRT Platform screen doors at Eastern Region Line stations will undergo renewal works from 1st March to 31st March 2026.',
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
                text: "Singapore's MRT system is the best in the world.",
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
