import { posix } from 'node:path';
import type {
  SchematicMapConstraintSet,
  SchematicMapManifest,
  SchematicMapRuleSet,
  SchematicMapVersionSnapshot,
} from '@mrtdown/core';
import {
  SchematicMapConstraintSetSchema,
  SchematicMapManifestSchema,
  SchematicMapRuleSetSchema,
  SchematicMapVersionSnapshotSchema,
} from '@mrtdown/core';
import {
  schematicSystemMapConstraintSetPath,
  schematicSystemMapManifestPath,
  schematicSystemMapRuleSetPath,
  schematicSystemMapVersionSnapshotPath,
} from '../../schematicMaps.js';
import type { IWriteStore } from '../common/store.js';

export class SchematicMapWriter {
  constructor(private readonly store: IWriteStore) {}

  writeManifest(manifest: SchematicMapManifest): void {
    const parsed = SchematicMapManifestSchema.parse(manifest);
    const path = schematicSystemMapManifestPath();
    this.store.ensureDir(posix.dirname(path));
    this.store.writeJson(path, parsed);
  }

  writeRuleSet(ruleSet: SchematicMapRuleSet): void {
    const parsed = SchematicMapRuleSetSchema.parse(ruleSet);
    const path = schematicSystemMapRuleSetPath(parsed.layoutEngineId);
    this.store.ensureDir(posix.dirname(path));
    this.store.writeJson(path, parsed);
  }

  writeConstraintSet(constraintSet: SchematicMapConstraintSet): void {
    const parsed = SchematicMapConstraintSetSchema.parse(constraintSet);
    const path = schematicSystemMapConstraintSetPath(parsed.effectiveDate);
    this.store.ensureDir(posix.dirname(path));
    this.store.writeJson(path, parsed);
  }

  writeVersionSnapshot(snapshot: SchematicMapVersionSnapshot): void {
    const parsed = SchematicMapVersionSnapshotSchema.parse(snapshot);
    const path = schematicSystemMapVersionSnapshotPath(parsed.effectiveDate);
    this.store.ensureDir(posix.dirname(path));
    this.store.writeJson(path, parsed);
  }
}
