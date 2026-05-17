import type { Claim } from '@mrtdown/core';
import { assert } from '../../assert.js';

/**
 * Get the slug date time from the claims.
 * @param claims - The claims.
 * @returns The slug date time or null if no time hints are found.
 */
export function getSlugDateTimeFromClaims(claims: Claim[]): string | null {
  const timeHints = claims
    .filter((claim) => claim.timeHints != null)
    .map((claim) => claim.timeHints);

  if (timeHints.length > 0) {
    assert(timeHints[0] != null, 'Expected time hints');
    switch (timeHints[0].kind) {
      case 'fixed': {
        return timeHints[0].startAt;
      }
      case 'recurring': {
        return timeHints[0].startAt;
      }
    }
  }

  return null;
}
