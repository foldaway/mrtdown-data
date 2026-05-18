import type { AffectedEntity } from '@mrtdown/core';

/**
 * Generate a stable key for an affected entity.
 * @param target - The affected entity.
 * @returns The key.
 */
export function keyForAffectedEntity(affectedEntity: AffectedEntity): string {
  switch (affectedEntity.type) {
    case 'service':
      return `service:${affectedEntity.serviceId}`;
    case 'facility': {
      if (affectedEntity.lineId != null) {
        return `facility:${affectedEntity.stationId}:${affectedEntity.lineId}:${affectedEntity.kind}`;
      }
      return `facility:${affectedEntity.stationId}:${affectedEntity.kind}`;
    }
  }
}
