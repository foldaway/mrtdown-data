import 'dotenv/config';

import { resolve } from 'node:path';
import { FileStore, MRTDownRepository } from '@mrtdown/fs';
import { describe } from 'vitest';
import { describeEval, StructuredOutputScorer } from 'vitest-evals';
import {
  type TriageNewEvidenceParams,
  type TriageNewEvidenceResult,
  triageNewEvidence,
} from './index.js';

describe('triageNewEvidence', () => {
  describeEval(
    'should triage the new evidence into an existing issue or a new issue',
    {
      // @ts-expect-error input is a string in the vitest-evals library
      async data() {
        const store = new FileStore(
          resolve(import.meta.dirname, '../../fixtures/data'),
        );
        const repo = new MRTDownRepository({ store });

        return [
          {
            input: {
              newEvidence: {
                ts: '2026-01-01T07:10:00+08:00',
                text: '[TGL] Due to a track fault at Tengah, train services on the Tengah Line are delayed between Bukit Batok and Bukit Merah Central',
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
                issueId: '2026-01-01-tgl-train-fault',
              },
            },
          },
          {
            input: {
              newEvidence: {
                ts: '2026-01-01T07:10:00+08:00',
                text: '[TGL] Due to a track fault at Tengah, train services on the Tengah Line are delayed between Bukit Merah Central and Outram Park',
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
                text: '[TGL] Due to maintenance works, services on the Tengah Line will end earlier at 11pm tonight.',
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
                text: '[SLL] Due to a track fault at Seletar, train services on the Seletar Line are delayed between Seletar Aerospace and Bukit Merah Central',
              },
              repo: new MRTDownRepository({
                store: new FileStore(
                  resolve(import.meta.dirname, '../fixtures/data'),
                ),
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
                text: '[SLL] MRT Platform screen doors at Seletar Line stations will undergo renewal works from 1st March to 31st March 2026.',
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
