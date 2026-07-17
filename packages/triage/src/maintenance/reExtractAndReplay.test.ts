import type { ImpactEvent } from '@mrtdown/core';
import { describe, expect, test } from 'vitest';
import { preserveExistingImpactEventIds } from './reExtractAndReplay.js';

describe('preserveExistingImpactEventIds', () => {
  test('keeps ids for unchanged events and leaves new events untouched', () => {
    const originalEvent: ImpactEvent = {
      id: 'ie-original',
      type: 'service_effects.set',
      ts: '2012-11-02T21:41:57.000+08:00',
      basis: { evidenceId: 'ev-1' },
      entity: { type: 'service', serviceId: 'EWL_MAIN_E' },
      effect: { kind: 'delay', duration: null },
    };
    const newScopeEvent: ImpactEvent = {
      id: 'ie-new-scope',
      type: 'service_scopes.set',
      ts: '2012-11-02T21:41:57.000+08:00',
      basis: { evidenceId: 'ev-1' },
      entity: { type: 'service', serviceId: 'EWL_MAIN_E' },
      serviceScopes: [{ type: 'service.whole' }],
    };

    expect(
      preserveExistingImpactEventIds(
        [{ ...originalEvent, id: 'ie-regenerated' }, newScopeEvent],
        [originalEvent],
      ),
    ).toEqual([originalEvent, newScopeEvent]);
  });
});
