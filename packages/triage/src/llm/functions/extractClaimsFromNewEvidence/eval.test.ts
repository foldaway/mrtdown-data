import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FileStore, MRTDownRepository } from '@mrtdown/fs';
import { config as loadDotEnv } from 'dotenv';
import { describe } from 'vitest';
import {
  createHarness,
  describeEval,
  StructuredOutputJudge,
} from 'vitest-evals';
import { assert } from '../../../util/assert.js';
import {
  type ExtractClaimsFromNewEvidenceParams,
  type ExtractClaimsFromNewEvidenceResult,
  extractClaimsFromNewEvidence,
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
    trainFault: { id: string };
  };
};
const optionalTrackWorkCause = ((actual: unknown) =>
  actual == null ||
  (Array.isArray(actual) &&
    actual.length === 1 &&
    actual[0] === 'track.work')) as unknown as null;
const hkFixtureTimeZone = ((actual: unknown) =>
  actual === 'Asia/Hong_Kong' ||
  actual === 'Asia/Singapore') as unknown as 'Asia/Hong_Kong';

const extractClaimsHarness = createHarness<
  ExtractClaimsFromNewEvidenceParams,
  ExtractClaimsFromNewEvidenceResult,
  { expected: ExtractClaimsFromNewEvidenceResult }
>({
  name: 'extractClaimsFromNewEvidence',
  async run({ input }) {
    const result = await extractClaimsFromNewEvidence(input);
    return { output: result };
  },
});

const fuzzyStructuredOutputJudge = StructuredOutputJudge({
  match: 'fuzzy',
  fuzzyOptions: { ignoreArrayOrder: true },
});

describe('extractClaimsFromNewEvidence', () => {
  describeEval(
    'should extract claims from new disruption evidence',
    {
      harness: extractClaimsHarness,
      judges: [fuzzyStructuredOutputJudge],
    },
    (it) => {
      const store = new FileStore(FIXTURE_DATA_DIR);
      const repo = new MRTDownRepository({ store });
      const issueBundle = repo.issues.get(FIXTURE_META.issues.trainFault.id);
      assert(issueBundle != null, 'Issue bundle not found');

      const cases = [
        {
          input: {
            newEvidence: {
              ts: '2026-01-01T07:10:00+08:00',
              text: '[ISL] Due to a track fault at HKU, train services on the Island Line are delayed between Kennedy Town and Admiralty',
            },
            repo,
            // This is used by vitest-evals as the test name, as the library expects `input` to be a string.
            toString() {
              return '[DISRUPTION] Expansion of scope';
            },
          },
          expected: {
            claims: [
              {
                entity: {
                  type: 'service',
                  serviceId: 'ISL_MAIN_E',
                },
                effect: {
                  facility: null,
                  service: {
                    kind: 'delay',
                    duration: null,
                  },
                },
                statusSignal: 'open',
                scopes: {
                  service: [
                    {
                      type: 'service.segment',
                      fromStationId: 'KET',
                      toStationId: 'ADM',
                    },
                  ],
                },
                timeHints: {
                  kind: 'start-only',
                  startAt: '2026-01-01T07:10:00+08:00',
                },
                causes: ['track.fault'],
              },
              {
                entity: {
                  type: 'service',
                  serviceId: 'ISL_MAIN_W',
                },
                effect: {
                  facility: null,
                  service: {
                    kind: 'delay',
                    duration: null,
                  },
                },
                statusSignal: 'open',
                scopes: {
                  service: [
                    {
                      type: 'service.segment',
                      fromStationId: 'ADM',
                      toStationId: 'KET',
                    },
                  ],
                },
                timeHints: {
                  kind: 'start-only',
                  startAt: '2026-01-01T07:10:00+08:00',
                },
                causes: ['track.fault'],
              },
            ],
          },
        },
        {
          input: {
            newEvidence: {
              ts: '2026-01-01T07:10:00+08:00',
              text: '[ISL] CLEARED: Fault has been cleared. Train service has resumed.',
            },
            repo,
            // This is used by vitest-evals as the test name, as the library expects `input` to be a string.
            toString() {
              return '[DISRUPTION] Issue resolved';
            },
          },
          expected: {
            claims: [
              {
                entity: {
                  type: 'service',
                  serviceId: 'ISL_MAIN_E',
                },
                effect: {
                  service: null,
                  facility: null,
                },
                scopes: {
                  service: null,
                },
                statusSignal: 'cleared',
                timeHints: {
                  kind: 'end-only',
                  endAt: '2026-01-01T07:10:00+08:00',
                },
                causes: null,
              },
              {
                entity: {
                  type: 'service',
                  serviceId: 'ISL_MAIN_W',
                },
                effect: {
                  service: null,
                  facility: null,
                },
                statusSignal: 'cleared',
                scopes: {
                  service: null,
                },
                timeHints: {
                  kind: 'end-only',
                  endAt: '2026-01-01T07:10:00+08:00',
                },
                causes: null,
              },
            ],
          },
        },
        {
          input: {
            newEvidence: {
              ts: '2026-01-01T07:10:00+08:00',
              text: '[ISL] UPDATE: For alternative travel options, please refer to https://t.co/Le6ROZGqsm',
            },
            repo,
            // This is used by vitest-evals as the test name, as the library expects `input` to be a string.
            toString() {
              return '[DISRUPTION] Irrelevant update';
            },
          },
          expected: {
            claims: [],
          },
        },
      ] satisfies {
        input: ExtractClaimsFromNewEvidenceParams & { toString(): string };
        expected: ExtractClaimsFromNewEvidenceResult;
      }[];

      it.for(
        cases.map(({ input, expected }) => ({
          name: input.toString(),
          input,
          expected,
        })),
      )('$name', async ({ input, expected }, { run }) => {
        await run(input, { metadata: { expected } });
      });
    },
  );
  describeEval(
    'should compute the impact of new maintenance evidence',
    {
      harness: extractClaimsHarness,
      judges: [fuzzyStructuredOutputJudge],
    },
    (it) => {
      const store = new FileStore(FIXTURE_DATA_DIR);
      const repo = new MRTDownRepository({ store });

      const cases = [
        {
          input: {
            newEvidence: {
              ts: '2026-01-01T07:10:00+08:00',
              text: '[ISL] The Island Line will be closed for maintenance on Sat &amp; Sun from 7 to 8 February 2026.',
            },
            repo,
            // This is used by vitest-evals as the test name, as the library expects `input` to be a string.
            toString() {
              return '[MAINTENANCE] New issue';
            },
          },
          expected: {
            claims: [
              {
                entity: {
                  type: 'service',
                  serviceId: 'ISL_MAIN_E',
                },
                effect: {
                  service: { kind: 'no-service' },
                  facility: null,
                },
                statusSignal: 'planned',
                scopes: {
                  service: [{ type: 'service.whole' }],
                },
                timeHints: {
                  kind: 'fixed',
                  startAt: '2026-02-07T00:00:00+08:00',
                  endAt: '2026-02-09T00:00:00+08:00',
                },
                causes: optionalTrackWorkCause,
              },
              {
                entity: {
                  type: 'service',
                  serviceId: 'ISL_MAIN_W',
                },
                effect: {
                  service: { kind: 'no-service' },
                  facility: null,
                },
                statusSignal: 'planned',
                scopes: {
                  service: [{ type: 'service.whole' }],
                },
                timeHints: {
                  kind: 'fixed',
                  startAt: '2026-02-07T00:00:00+08:00',
                  endAt: '2026-02-09T00:00:00+08:00',
                },
                causes: optionalTrackWorkCause,
              },
            ],
          },
        },
        {
          input: {
            newEvidence: {
              ts: '2026-01-01T07:10:00+08:00',
              text: 'To continue testing the integrated systems and trains in preparation for Stage 2 of #ISL, train services between Kennedy Town and Admiralty in both directions will start later at 6.30am and end at 9pm daily from 1 to 8 February 2026.',
            },
            repo,
            // This is used by vitest-evals as the test name, as the library expects `input` to be a string.
            toString() {
              return '[MAINTENANCE] Service hour adjustments';
            },
          },
          expected: {
            claims: [
              {
                entity: {
                  type: 'service',
                  serviceId: 'ISL_MAIN_E',
                },
                effect: {
                  service: {
                    kind: 'service-hours-adjustment',
                  },
                  facility: null,
                },
                statusSignal: 'planned',
                scopes: {
                  service: [
                    {
                      type: 'service.segment',
                      fromStationId: 'KET',
                      toStationId: 'ADM',
                    },
                  ],
                },
                timeHints: {
                  kind: 'recurring',
                  frequency: 'daily',
                  startAt: '2026-02-01T21:00:00+08:00',
                  endAt: '2026-02-08T21:00:00+08:00',
                  daysOfWeek: null,
                  timeZone: hkFixtureTimeZone,
                  timeWindow: {
                    startAt: '21:00:00',
                    endAt: '06:30:00',
                  },
                  excludedDates: null,
                },
                causes: ['system.upgrade'],
              },
              {
                entity: {
                  type: 'service',
                  serviceId: 'ISL_MAIN_W',
                },
                effect: {
                  service: {
                    kind: 'service-hours-adjustment',
                  },
                  facility: null,
                },
                statusSignal: 'planned',
                scopes: {
                  service: [
                    {
                      type: 'service.segment',
                      fromStationId: 'ADM',
                      toStationId: 'KET',
                    },
                  ],
                },
                timeHints: {
                  kind: 'recurring',
                  frequency: 'daily',
                  startAt: '2026-02-01T21:00:00+08:00',
                  endAt: '2026-02-08T21:00:00+08:00',
                  daysOfWeek: null,
                  timeZone: hkFixtureTimeZone,
                  timeWindow: {
                    startAt: '21:00:00',
                    endAt: '06:30:00',
                  },
                  excludedDates: null,
                },
                causes: ['system.upgrade'],
              },
            ],
          },
        },
        {
          input: {
            newEvidence: {
              ts: '2026-01-05T22:12:16+08:00',
              text: 'During integrated systems testing, trains are operating at reduced frequency across the full Island and Tsuen Wan lines, causing longer waits of up to 17 minutes. A separate final service suspension to disconnect the shared systems is planned for the first half of 2026.',
            },
            repo,
            toString() {
              return '[MAINTENANCE] Longer waits should not become no-service';
            },
          },
          expected: {
            claims: [
              {
                entity: {
                  type: 'service',
                  serviceId: 'ISL_MAIN_E',
                },
                effect: {
                  service: { kind: 'reduced-service' },
                  facility: null,
                },
                statusSignal: 'open',
                scopes: {
                  service: [{ type: 'service.whole' }],
                },
                timeHints: {
                  kind: 'start-only',
                  startAt: '2026-01-05T22:12:16+08:00',
                },
                causes: ['system.upgrade'],
              },
              {
                entity: {
                  type: 'service',
                  serviceId: 'ISL_MAIN_W',
                },
                effect: {
                  service: { kind: 'reduced-service' },
                  facility: null,
                },
                statusSignal: 'open',
                scopes: {
                  service: [{ type: 'service.whole' }],
                },
                timeHints: {
                  kind: 'start-only',
                  startAt: '2026-01-05T22:12:16+08:00',
                },
                causes: ['system.upgrade'],
              },
              {
                entity: {
                  type: 'service',
                  serviceId: 'TWL_MAIN_S',
                },
                effect: {
                  service: { kind: 'reduced-service' },
                  facility: null,
                },
                statusSignal: 'open',
                scopes: {
                  service: [{ type: 'service.whole' }],
                },
                timeHints: {
                  kind: 'start-only',
                  startAt: '2026-01-05T22:12:16+08:00',
                },
                causes: ['system.upgrade'],
              },
              {
                entity: {
                  type: 'service',
                  serviceId: 'TWL_MAIN_N',
                },
                effect: {
                  service: { kind: 'reduced-service' },
                  facility: null,
                },
                statusSignal: 'open',
                scopes: {
                  service: [{ type: 'service.whole' }],
                },
                timeHints: {
                  kind: 'start-only',
                  startAt: '2026-01-05T22:12:16+08:00',
                },
                causes: ['system.upgrade'],
              },
            ],
          },
        },
        {
          input: {
            newEvidence: {
              ts: '2026-01-10T22:00:00+08:00',
              text: 'The Island & Tsuen Wan Lines train service will start at 10am on 18 Feb. For replacement bus pick-up points, visit http://t.co/fwb2wOqI',
            },
            repo,
            // This is used by vitest-evals as the test name, as the library expects `input` to be a string.
            toString() {
              return '[MAINTENANCE] Service hour adjustments';
            },
          },
          expected: {
            claims: [
              {
                entity: {
                  type: 'service',
                  serviceId: 'ISL_MAIN_E',
                },
                effect: {
                  service: { kind: 'service-hours-adjustment' },
                  facility: null,
                },
                statusSignal: 'planned',
                scopes: {
                  service: [{ type: 'service.whole' }],
                },
                timeHints: {
                  kind: 'fixed',
                  startAt: '2026-02-18T00:00:00+08:00',
                  endAt: '2026-02-18T10:00:00+08:00',
                },
                causes: null,
              },
              {
                entity: {
                  type: 'service',
                  serviceId: 'ISL_MAIN_W',
                },
                effect: {
                  service: { kind: 'service-hours-adjustment' },
                  facility: null,
                },
                statusSignal: 'planned',
                scopes: {
                  service: [{ type: 'service.whole' }],
                },
                timeHints: {
                  kind: 'fixed',
                  startAt: '2026-02-18T00:00:00+08:00',
                  endAt: '2026-02-18T10:00:00+08:00',
                },
                causes: null,
              },
              {
                entity: {
                  type: 'service',
                  serviceId: 'TWL_MAIN_S',
                },
                effect: {
                  service: { kind: 'service-hours-adjustment' },
                  facility: null,
                },
                scopes: {
                  service: [{ type: 'service.whole' }],
                },
                timeHints: {
                  kind: 'fixed',
                  startAt: '2026-02-18T00:00:00+08:00',
                  endAt: '2026-02-18T10:00:00+08:00',
                },
                statusSignal: 'planned',
                causes: null,
              },
              {
                entity: {
                  type: 'service',
                  serviceId: 'TWL_MAIN_N',
                },
                effect: {
                  service: { kind: 'service-hours-adjustment' },
                  facility: null,
                },
                scopes: {
                  service: [{ type: 'service.whole' }],
                },
                timeHints: {
                  kind: 'fixed',
                  startAt: '2026-02-18T00:00:00+08:00',
                  endAt: '2026-02-18T10:00:00+08:00',
                },
                statusSignal: 'planned',
                causes: null,
              },
            ],
          },
        },
      ] satisfies {
        input: ExtractClaimsFromNewEvidenceParams & { toString(): string };
        expected: ExtractClaimsFromNewEvidenceResult;
      }[];

      it.for(
        cases.map(({ input, expected }) => ({
          name: input.toString(),
          input,
          expected,
        })),
      )('$name', async ({ input, expected }, { run }) => {
        await run(input, { metadata: { expected } });
      });
    },
  );
});
