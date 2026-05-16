import type { DateTime } from 'luxon';
import { decodeTime, isValid, ulid } from 'ulid';

export type GeneratedIdKind = 'evidence' | 'impact-event';

export interface GeneratedIdInfo {
  id: string;
  kind: GeneratedIdKind;
  ulid: string;
  timestampMs: number;
}

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
    return `ev_${ulid(timestampMillis(ts))}`;
  },

  /**
   * Generate a unique ID for an impact event.
   * @param ts - The timestamp of the impact event.
   * @returns
   */
  impactEventId(ts?: DateTime) {
    return `ie_${ulid(timestampMillis(ts))}`;
  },

  /**
   * Inspect a generated evidence / impact-event ID and recover its embedded timestamp.
   */
  inspect(id: string): GeneratedIdInfo | null {
    const match = /^(ev|ie)_([0-9A-HJKMNP-TV-Z]{26})$/.exec(id);
    if (match == null) {
      return null;
    }

    const [, prefix, rawUlid] = match;
    if (!isValid(rawUlid)) {
      return null;
    }

    return {
      id,
      kind: prefix === 'ev' ? 'evidence' : 'impact-event',
      ulid: rawUlid,
      timestampMs: decodeTime(rawUlid),
    };
  },
};

function timestampMillis(ts?: DateTime): number | undefined {
  if (ts == null) {
    return undefined;
  }
  if (!ts.isValid) {
    throw new Error(`Invalid timestamp for generated ID: ${ts.invalidReason}`);
  }
  return ts.toMillis();
}
