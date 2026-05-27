import { posix } from 'node:path';
import type {
  SchematicMapConstraintSet,
  SchematicMapEffectiveDate,
  SchematicMapLayoutEngineId,
  SchematicMapManifest,
  SchematicMapRuleSet,
  SchematicMapVersionSnapshot,
} from '@mrtdown/core';
import {
  SchematicMapConstraintSetSchema,
  SchematicMapEffectiveDateSchema,
  SchematicMapManifestSchema,
  SchematicMapRuleSetSchema,
  SchematicMapVersionSnapshotSchema,
} from '@mrtdown/core';
import {
  DIR_SCHEMATIC_MAP_CONSTRAINT,
  DIR_SCHEMATIC_MAP_GENERATOR,
  DIR_SCHEMATIC_MAP_VERSION,
} from '../../constants.js';
import {
  schematicSystemMapConstraintSetPath,
  schematicSystemMapManifestPath,
  schematicSystemMapRootPath,
  schematicSystemMapRuleSetPath,
  schematicSystemMapVersionSnapshotPath,
} from '../../schematicMaps.js';
import type { IStore } from '../common/store.js';

export class SchematicMapRepository {
  constructor(private readonly store: IStore) {}

  getManifest(): SchematicMapManifest | null {
    const path = schematicSystemMapManifestPath();
    if (!this.store.exists(path)) {
      return null;
    }

    return SchematicMapManifestSchema.parse(this.store.readJson(path));
  }

  getRuleSet(
    layoutEngineId: SchematicMapLayoutEngineId = 'lta-system-map-2011',
  ): SchematicMapRuleSet | null {
    const path = schematicSystemMapRuleSetPath(layoutEngineId);
    if (!this.store.exists(path)) {
      return null;
    }

    return SchematicMapRuleSetSchema.parse(this.store.readJson(path));
  }

  listConstraintSetEffectiveDates(): SchematicMapEffectiveDate[] {
    const dir = posix.join(
      schematicSystemMapRootPath(),
      DIR_SCHEMATIC_MAP_GENERATOR,
      DIR_SCHEMATIC_MAP_CONSTRAINT,
    );
    if (!this.store.exists(dir)) {
      return [];
    }

    return this.store
      .listDir(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) =>
        SchematicMapEffectiveDateSchema.parse(name.replace(/\.json$/, '')),
      )
      .sort();
  }

  getConstraintSet(
    effectiveDate: SchematicMapEffectiveDate,
  ): SchematicMapConstraintSet | null {
    const path = schematicSystemMapConstraintSetPath(effectiveDate);
    if (!this.store.exists(path)) {
      return null;
    }

    return SchematicMapConstraintSetSchema.parse(this.store.readJson(path));
  }

  listConstraintSets(): SchematicMapConstraintSet[] {
    return this.listConstraintSetEffectiveDates().map((effectiveDate) => {
      const constraintSet = this.getConstraintSet(effectiveDate);
      if (!constraintSet) {
        throw new Error(
          `Missing schematic map constraint set: ${effectiveDate}`,
        );
      }
      return constraintSet;
    });
  }

  listVersionSnapshotEffectiveDates(): SchematicMapEffectiveDate[] {
    const dir = posix.join(
      schematicSystemMapRootPath(),
      DIR_SCHEMATIC_MAP_VERSION,
    );
    if (!this.store.exists(dir)) {
      return [];
    }

    return this.store
      .listDir(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) =>
        SchematicMapEffectiveDateSchema.parse(name.replace(/\.json$/, '')),
      )
      .sort();
  }

  getVersionSnapshot(
    effectiveDate: SchematicMapEffectiveDate,
  ): SchematicMapVersionSnapshot | null {
    const path = schematicSystemMapVersionSnapshotPath(effectiveDate);
    if (!this.store.exists(path)) {
      return null;
    }

    return SchematicMapVersionSnapshotSchema.parse(this.store.readJson(path));
  }

  listVersionSnapshots(): SchematicMapVersionSnapshot[] {
    return this.listVersionSnapshotEffectiveDates().map((effectiveDate) => {
      const snapshot = this.getVersionSnapshot(effectiveDate);
      if (!snapshot) {
        throw new Error(`Missing schematic map snapshot: ${effectiveDate}`);
      }
      return snapshot;
    });
  }
}
