import 'dotenv/config';

import { resolve } from 'node:path';
import { describe } from 'vitest';
import { describeEval, StructuredOutputScorer } from 'vitest-evals';
import { FileStore } from '../../../repo/common/FileStore.js';
import { MRTDownRepository } from '../../../repo/MRTDownRepository.js';
import { assert } from '../../../util/assert.js';
import {
  type ExtractClaimsFromNewEvidenceParams,
  type ExtractClaimsFromNewEvidenceResult,
  extractClaimsFromNewEvidence,
} from './index.js';

describe('extractClaimsFromNewEvidence', () => {
  describeEval('should extract claims from new disruption evidence', {
    // @ts-expect-error input is a string in the vitest-evals library
    async data() {
      const store = new FileStore(
        resolve(import.meta.dirname, '../../fixtures/data'),
      );
      const repo = new MRTDownRepository({ store });
      const issueBundle = repo.issues.get('2026-01-01-tgl-train-fault');
      assert(issueBundle != null, 'Issue bundle not found');

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
              return '[DISRUPTION] Expansion of scope';
            },
          },
          expected: {
            claims: [
              {
                entity: {
                  type: 'service',
                  serviceId: 'TGL_MAIN_E',
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
                      fromStationId: 'BBT',
                      toStationId: 'BMC',
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
                  serviceId: 'TGL_MAIN_W',
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
                      fromStationId: 'BMC',
                      toStationId: 'BBT',
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
              text: '[TGL] CLEARED: Fault has been cleared. Train service has resumed.',
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
                  serviceId: 'TGL_MAIN_E',
                },
                effect: {
                  service: null,
                  facility: null,
                },
                scopes: {
                  service: [{ type: 'service.whole' }],
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
                  serviceId: 'TGL_MAIN_W',
                },
                effect: {
                  service: null,
                  facility: null,
                },
                statusSignal: 'cleared',
                scopes: {
                  service: [{ type: 'service.whole' }],
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
              text: '[TGL] UPDATE: For alternative travel options, please refer to https://t.co/Le6ROZGqsm',
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
    },
    async task(input) {
      const result = await extractClaimsFromNewEvidence(
        input as unknown as ExtractClaimsFromNewEvidenceParams,
      );
      return JSON.stringify(result);
    },
    scorers: [StructuredOutputScorer()],
  });
  describeEval('should compute the impact of new maintenance evidence', {
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
              text: '[TGL] The Tengah Line will be closed for maintenance on Sat &amp; Sun from 7 to 8 February 2026.',
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
                  serviceId: 'TGL_MAIN_E',
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
                causes: null,
              },
              {
                entity: {
                  type: 'service',
                  serviceId: 'TGL_MAIN_W',
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
                causes: null,
              },
            ],
          },
        },
        {
          input: {
            newEvidence: {
              ts: '2026-01-01T07:10:00+08:00',
              text: 'To continue testing the integrated systems and trains in preparation for Stage 2 of #TGL, train services from Bukit Batok to Bukit Merah Central will start later at 6.30am and end at 9pm daily from 1 to 8 February 2026.',
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
                  serviceId: 'TGL_MAIN_E',
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
                      fromStationId: 'BBT',
                      toStationId: 'BMC',
                    },
                  ],
                },
                timeHints: {
                  kind: 'recurring',
                  frequency: 'daily',
                  startAt: '2026-02-01T21:00:00+08:00',
                  endAt: '2026-02-08T21:00:00+08:00',
                  daysOfWeek: null,
                  timeZone: 'Asia/Singapore',
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
                  serviceId: 'TGL_MAIN_W',
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
                      fromStationId: 'BMC',
                      toStationId: 'BBT',
                    },
                  ],
                },
                timeHints: {
                  kind: 'recurring',
                  frequency: 'daily',
                  startAt: '2026-02-01T21:00:00+08:00',
                  endAt: '2026-02-08T21:00:00+08:00',
                  daysOfWeek: null,
                  timeZone: 'Asia/Singapore',
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
              ts: '2026-01-10T22:00:00+08:00',
              text: 'The Tengah & Seletar Lines train service will start at 10am on 18 Feb. For MRT Shuttle Bus pick-up points, visit http://t.co/fwb2wOqI',
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
                  serviceId: 'TGL_MAIN_E',
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
                  serviceId: 'TGL_MAIN_W',
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
                  serviceId: 'SLL_MAIN_N',
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
                  serviceId: 'SLL_MAIN_S',
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
    },
    async task(input) {
      const result = await extractClaimsFromNewEvidence(
        input as unknown as ExtractClaimsFromNewEvidenceParams,
      );
      return JSON.stringify(result);
    },
    scorers: [
      StructuredOutputScorer({
        match: 'fuzzy',
        fuzzyOptions: { ignoreArrayOrder: true },
      }),
    ],
  });
});
