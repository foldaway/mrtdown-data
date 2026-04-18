import type { DateTime } from 'luxon';
import { ulid } from 'ulid';

/**
 * A utility for generating unique IDs.
 */
export const IdGenerator = {
  /**
   * Generate a unique ID for an evidence.
   * @param ts - The timestamp of the evidence.
   * @returns
   */
  evidenceId(ts?: DateTime) {
    return `ev_${ulid(ts?.toMillis?.() ?? undefined)}`;
  },

  /**
   * Generate a unique ID for an impact event.
   * @param ts - The timestamp of the impact event.
   * @returns
   */
  impactEventId(ts?: DateTime) {
    return `ie_${ulid(ts?.toMillis?.() ?? undefined)}`;
  },
};
