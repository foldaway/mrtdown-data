import type { AffectedEntity } from '../schema/issue/entity.js';

/**
 * Generate a stable key for an affected entity.
 * @param target - The affected entity.
 * @returns The key.
 */
export function keyForAffectedEntity(affectedEntity: AffectedEntity): string {
  switch (affectedEntity.type) {
    case 'service':
      return `service:${affectedEntity.serviceId}`;
    case 'facility':
      return `facility:${affectedEntity.stationId}:${affectedEntity.kind}`;
  }
}
