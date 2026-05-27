import type {
  IssueBundle,
  SchematicMapConstraintSet,
  SchematicMapManifest,
  SchematicMapRuleSet,
  SchematicMapVersionSnapshot,
} from '@mrtdown/core';
import type { z } from 'zod';
import {
  type EntityCollection,
  entityCollections,
  evidenceFileName,
  impactFileName,
  issueDirectory,
  schematicMapDirectory,
} from './constants.js';
import { type EntityRecord, listEntities } from './entities.js';
import { listIssueBundles } from './issues.js';
import {
  listSchematicMapConstraintSets,
  listSchematicMapRuleSets,
  listSchematicMapVersionSnapshots,
  readSchematicMapManifest,
  type SchematicMapRecord,
  schematicSystemMapConstraintSetPath,
  schematicSystemMapRuleSetPath,
  schematicSystemMapVersionSnapshotPath,
} from './schematicMaps.js';

export type ValidationScope = EntityCollection | 'issue' | 'schematic-map';

export type ValidationResult = {
  ok: boolean;
  checked: Record<ValidationScope, number>;
  errors: string[];
};

function emptyChecked(): Record<ValidationScope, number> {
  return Object.fromEntries(
    [...entityCollections, issueDirectory, schematicMapDirectory].map(
      (scope) => [scope, 0],
    ),
  ) as Record<ValidationScope, number>;
}

function formatError(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    return (error as z.ZodError).issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
  }
  return error instanceof Error ? error.message : String(error);
}

function shouldValidateScope(
  scopes: readonly ValidationScope[],
  scope: ValidationScope,
): boolean {
  return scopes.includes(scope);
}

type ValidationRecords = Partial<{
  landmark: EntityRecord<'landmark'>[];
  line: EntityRecord<'line'>[];
  operator: EntityRecord<'operator'>[];
  service: EntityRecord<'service'>[];
  station: EntityRecord<'station'>[];
  town: EntityRecord<'town'>[];
  issue: IssueBundle[];
  schematicMap: SchematicMapValidationRecords;
}>;

type SchematicMapValidationRecords = {
  manifest: SchematicMapRecord<SchematicMapManifest> | null;
  ruleSets: SchematicMapRecord<SchematicMapRuleSet>[];
  constraintSets: SchematicMapRecord<SchematicMapConstraintSet>[];
  versionSnapshots: SchematicMapRecord<SchematicMapVersionSnapshot>[];
};

const generatedEvidenceIdPattern = /^ev_[0-9A-HJKMNP-TV-Z]{26}$/;

async function loadEntityRecords<K extends EntityCollection>(
  dataDir: string,
  records: ValidationRecords,
  collection: K,
): Promise<EntityRecord<K>[]> {
  const loadedRecords = records[collection] as EntityRecord<K>[] | undefined;
  if (loadedRecords) {
    return loadedRecords;
  }

  const nextRecords = await listEntities(dataDir, collection);
  (records as Record<string, unknown>)[collection] = nextRecords;
  return nextRecords;
}

async function loadEntityIds<K extends EntityCollection>(
  dataDir: string,
  records: ValidationRecords,
  collection: K,
): Promise<Set<string>> {
  const loadedRecords = await loadEntityRecords(dataDir, records, collection);
  return new Set(loadedRecords.map((record) => record.value.id));
}

async function loadIssueRecords(
  dataDir: string,
  records: ValidationRecords,
): Promise<IssueBundle[]> {
  if (!records.issue) {
    records.issue = await listIssueBundles(dataDir);
  }
  return records.issue;
}

async function readOptionalSchematicMapRecord<T>(
  read: () => Promise<SchematicMapRecord<T>>,
): Promise<SchematicMapRecord<T> | null> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function loadSchematicMapRecords(
  dataDir: string,
  records: ValidationRecords,
): Promise<SchematicMapValidationRecords> {
  if (records.schematicMap) {
    return records.schematicMap;
  }

  records.schematicMap = {
    manifest: await readOptionalSchematicMapRecord(() =>
      readSchematicMapManifest(dataDir),
    ),
    ruleSets: await listSchematicMapRuleSets(dataDir),
    constraintSets: await listSchematicMapConstraintSets(dataDir),
    versionSnapshots: await listSchematicMapVersionSnapshots(dataDir),
  };
  return records.schematicMap;
}

async function validateStationReferences(
  dataDir: string,
  shouldValidate: boolean,
  records: ValidationRecords,
): Promise<string[]> {
  if (!shouldValidate) {
    return [];
  }

  const lineIds = await loadEntityIds(dataDir, records, 'line');
  const landmarkIds = await loadEntityIds(dataDir, records, 'landmark');
  const townIds = await loadEntityIds(dataDir, records, 'town');
  const errors: string[] = [];

  for (const station of await loadEntityRecords(dataDir, records, 'station')) {
    if (!townIds.has(station.value.townId)) {
      errors.push(
        `${station.path}: townId ${station.value.townId} does not exist in town/`,
      );
    }

    for (const [index, landmarkId] of station.value.landmarkIds.entries()) {
      if (!landmarkIds.has(landmarkId)) {
        errors.push(
          `${station.path}: landmarkIds.${index} ${landmarkId} does not exist in landmark/`,
        );
      }
    }

    for (const [index, stationCode] of station.value.stationCodes.entries()) {
      if (!lineIds.has(stationCode.lineId)) {
        errors.push(
          `${station.path}: stationCodes.${index}.lineId ${stationCode.lineId} does not exist in line/`,
        );
      }
    }
  }

  return errors;
}

async function validateLineReferences(
  dataDir: string,
  shouldValidate: boolean,
  records: ValidationRecords,
): Promise<string[]> {
  if (!shouldValidate) {
    return [];
  }

  const operatorIds = await loadEntityIds(dataDir, records, 'operator');
  const serviceIds = await loadEntityIds(dataDir, records, 'service');
  const errors: string[] = [];

  for (const line of await loadEntityRecords(dataDir, records, 'line')) {
    for (const [index, operator] of line.value.operators.entries()) {
      if (!operatorIds.has(operator.operatorId)) {
        errors.push(
          `${line.path}: operators.${index}.operatorId ${operator.operatorId} does not exist in operator/`,
        );
      }
    }

    for (const [index, serviceId] of line.value.serviceIds.entries()) {
      if (!serviceIds.has(serviceId)) {
        errors.push(
          `${line.path}: serviceIds.${index} ${serviceId} does not exist in service/`,
        );
      }
    }
  }

  return errors;
}

async function validateServiceReferences(
  dataDir: string,
  shouldValidate: boolean,
  records: ValidationRecords,
): Promise<string[]> {
  if (!shouldValidate) {
    return [];
  }

  const lineIds = await loadEntityIds(dataDir, records, 'line');
  const stationRecords = await loadEntityRecords(dataDir, records, 'station');
  const stationById = new Map(
    stationRecords.map((station) => [station.value.id, station]),
  );
  const errors: string[] = [];

  for (const service of await loadEntityRecords(dataDir, records, 'service')) {
    if (!lineIds.has(service.value.lineId)) {
      errors.push(
        `${service.path}: lineId ${service.value.lineId} does not exist in line/`,
      );
    }

    for (const [revisionIndex, revision] of service.value.revisions.entries()) {
      for (const [stationIndex, station] of revision.path.stations.entries()) {
        const stationRecord = stationById.get(station.stationId);
        if (!stationRecord) {
          errors.push(
            `${service.path}: revisions.${revisionIndex}.path.stations.${stationIndex}.stationId ${station.stationId} does not exist in station/`,
          );
          continue;
        }

        const matchingStationCodes = stationRecord.value.stationCodes.filter(
          (stationCode) =>
            stationCode.lineId === service.value.lineId &&
            stationCode.code === station.displayCode,
        );

        if (station.displayCode !== '' && matchingStationCodes.length === 0) {
          errors.push(
            `${service.path}: revisions.${revisionIndex}.path.stations.${stationIndex}.displayCode ${station.displayCode} does not match a station code for ${station.stationId} on line ${service.value.lineId}`,
          );
          continue;
        }

        if (
          matchingStationCodes.length > 0 &&
          !matchingStationCodes.some((stationCode) =>
            stationCodeContainsRevision(
              stationCode.startedAt,
              stationCode.endedAt,
              revision.startAt,
              revision.endAt,
            ),
          )
        ) {
          errors.push(
            `${service.path}: revisions.${revisionIndex}.path.stations.${stationIndex}.displayCode ${station.displayCode} for station ${station.stationId} is outside the station code active window`,
          );
        }
      }
    }
  }

  return errors;
}

function timestampForValidation(value: string): number {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid timestamp for validation: ${value}`);
  }
  return timestamp;
}

function stationCodeContainsRevision(
  stationCodeStartedAt: string,
  stationCodeEndedAt: string | null,
  revisionStartAt: string,
  revisionEndAt: string | null,
): boolean {
  const stationCodeStart = timestampForValidation(stationCodeStartedAt);
  const revisionStart = timestampForValidation(revisionStartAt);
  const stationCodeEnd = stationCodeEndedAt
    ? timestampForValidation(stationCodeEndedAt)
    : Number.POSITIVE_INFINITY;
  const revisionEnd = revisionEndAt
    ? timestampForValidation(revisionEndAt)
    : Number.POSITIVE_INFINITY;

  return stationCodeStart <= revisionStart && revisionEnd <= stationCodeEnd;
}

async function validateIssueReferences(
  dataDir: string,
  shouldValidate: boolean,
  records: ValidationRecords,
): Promise<string[]> {
  if (!shouldValidate) {
    return [];
  }

  const serviceIds = await loadEntityIds(dataDir, records, 'service');
  const stationIds = await loadEntityIds(dataDir, records, 'station');
  const lineIds = await loadEntityIds(dataDir, records, 'line');
  const errors: string[] = [];
  const seenEvidenceIds = new Map<string, string>();
  const seenImpactEventIds = new Map<string, string>();

  for (const bundle of await loadIssueRecords(dataDir, records)) {
    const evidenceIds = new Set(bundle.evidence.map((evidence) => evidence.id));
    const evidencePath = `${bundle.path}/${evidenceFileName}`;
    const impactPath = `${bundle.path}/${impactFileName}`;

    for (const [evidenceIndex, evidence] of bundle.evidence.entries()) {
      const location = `${evidencePath}:${evidenceIndex + 1}`;
      if (!generatedEvidenceIdPattern.test(evidence.id)) {
        errors.push(
          `${location}: evidence id ${evidence.id} is not an ev_<ULID>`,
        );
      }

      const previousLocation = seenEvidenceIds.get(evidence.id);
      if (previousLocation) {
        errors.push(
          `${location}: evidence id ${evidence.id} is duplicated (first seen at ${previousLocation})`,
        );
      } else {
        seenEvidenceIds.set(evidence.id, location);
      }
    }

    for (const [eventIndex, event] of bundle.impactEvents.entries()) {
      const linePrefix = `${impactPath}:${eventIndex + 1}`;
      const previousLocation = seenImpactEventIds.get(event.id);
      if (previousLocation) {
        errors.push(
          `${linePrefix}: impact event id ${event.id} is duplicated (first seen at ${previousLocation})`,
        );
      } else {
        seenImpactEventIds.set(event.id, linePrefix);
      }

      if (!evidenceIds.has(event.basis.evidenceId)) {
        errors.push(
          `${linePrefix}: basis.evidenceId ${event.basis.evidenceId} does not exist in evidence.ndjson`,
        );
      }

      if (event.entity.type === 'service') {
        if (!serviceIds.has(event.entity.serviceId)) {
          errors.push(
            `${linePrefix}: entity.serviceId ${event.entity.serviceId} does not exist in service/`,
          );
        }
      } else if (!stationIds.has(event.entity.stationId)) {
        errors.push(
          `${linePrefix}: entity.stationId ${event.entity.stationId} does not exist in station/`,
        );
      } else if (
        event.entity.lineId != null &&
        !lineIds.has(event.entity.lineId)
      ) {
        errors.push(
          `${linePrefix}: entity.lineId ${event.entity.lineId} does not exist in line/`,
        );
      }

      if (event.type !== 'service_scopes.set') {
        continue;
      }

      for (const [scopeIndex, scope] of event.serviceScopes.entries()) {
        if (scope.type === 'service.segment') {
          if (!stationIds.has(scope.fromStationId)) {
            errors.push(
              `${linePrefix}: serviceScopes.${scopeIndex}.fromStationId ${scope.fromStationId} does not exist in station/`,
            );
          }
          if (!stationIds.has(scope.toStationId)) {
            errors.push(
              `${linePrefix}: serviceScopes.${scopeIndex}.toStationId ${scope.toStationId} does not exist in station/`,
            );
          }
        }

        if (
          scope.type === 'service.point' &&
          !stationIds.has(scope.stationId)
        ) {
          errors.push(
            `${linePrefix}: serviceScopes.${scopeIndex}.stationId ${scope.stationId} does not exist in station/`,
          );
        }
      }
    }
  }

  return errors;
}

async function validateSchematicMapReferences(
  dataDir: string,
  shouldValidate: boolean,
  records: ValidationRecords,
): Promise<string[]> {
  if (!shouldValidate) {
    return [];
  }

  const lineIds = await loadEntityIds(dataDir, records, 'line');
  const stationRecords = await loadEntityRecords(dataDir, records, 'station');
  const stationById = new Map(
    stationRecords.map((station) => [station.value.id, station]),
  );
  const stationIds = new Set(stationById.keys());
  const schematicMap = await loadSchematicMapRecords(dataDir, records);
  const errors: string[] = [];

  const requireLineId = (path: string, lineId: string) => {
    if (!lineIds.has(lineId)) {
      errors.push(`${path} ${lineId} does not exist in line/`);
    }
  };

  const requireStationId = (path: string, stationId: string) => {
    if (!stationIds.has(stationId)) {
      errors.push(`${path} ${stationId} does not exist in station/`);
    }
  };

  const requireStationLineId = (
    path: string,
    stationId: string,
    lineId: string,
  ) => {
    const station = stationById.get(stationId);
    if (!station) {
      return;
    }

    if (!station.value.stationCodes.some((code) => code.lineId === lineId)) {
      errors.push(
        `${path} ${lineId} is not a station code line for station ${stationId}`,
      );
    }
  };

  for (const ruleSet of schematicMap.ruleSets) {
    const expectedPath = schematicSystemMapRuleSetPath(
      ruleSet.value.layoutEngineId,
    );

    if (ruleSet.path !== expectedPath) {
      errors.push(
        `${ruleSet.path}: layoutEngineId ${ruleSet.value.layoutEngineId} does not match ${expectedPath}`,
      );
    }

    ruleSet.value.lineOrder.forEach((lineId, index) => {
      requireLineId(`${ruleSet.path}: lineOrder.${index}`, lineId);
    });
  }

  for (const constraintSet of schematicMap.constraintSets) {
    const expectedPath = schematicSystemMapConstraintSetPath(
      constraintSet.value.effectiveDate,
    );

    if (constraintSet.path !== expectedPath) {
      errors.push(
        `${constraintSet.path}: effectiveDate ${constraintSet.value.effectiveDate} does not match ${expectedPath}`,
      );
    }

    for (const [
      index,
      constraint,
    ] of constraintSet.value.constraints.entries()) {
      const prefix = `${constraintSet.path}: constraints.${index}`;

      if (constraint.type === 'station_anchor') {
        requireStationId(`${prefix}.stationId`, constraint.stationId);
      } else if (constraint.type === 'segment_route_hint') {
        requireLineId(`${prefix}.lineId`, constraint.lineId);
        requireStationId(`${prefix}.fromStationId`, constraint.fromStationId);
        requireStationId(`${prefix}.toStationId`, constraint.toStationId);
      } else if (constraint.type === 'line_order') {
        constraint.lineIds.forEach((lineId, lineIndex) => {
          requireLineId(`${prefix}.lineIds.${lineIndex}`, lineId);
        });
      } else if (constraint.type === 'label_hint') {
        requireStationId(`${prefix}.stationId`, constraint.stationId);
      } else if (constraint.type === 'interchange_hint') {
        requireStationId(`${prefix}.stationId`, constraint.stationId);
        constraint.lineIds.forEach((lineId, lineIndex) => {
          requireLineId(`${prefix}.lineIds.${lineIndex}`, lineId);
        });
      }
    }
  }

  const validSnapshotEffectiveDates = new Set<string>();

  for (const snapshot of schematicMap.versionSnapshots) {
    const expectedPath = schematicSystemMapVersionSnapshotPath(
      snapshot.value.effectiveDate,
    );

    if (snapshot.path !== expectedPath) {
      errors.push(
        `${snapshot.path}: effectiveDate ${snapshot.value.effectiveDate} does not match ${expectedPath}`,
      );
      continue;
    }

    validSnapshotEffectiveDates.add(snapshot.value.effectiveDate);
  }

  if (schematicMap.manifest) {
    for (const [
      index,
      version,
    ] of schematicMap.manifest.value.versions.entries()) {
      const prefix = `${schematicMap.manifest.path}: versions.${index}`;
      const expectedMapRelativePath = `version/${version.effectiveDate}.json`;

      if (version.path !== expectedMapRelativePath) {
        errors.push(
          `${prefix}.path ${version.path} does not match ${expectedMapRelativePath}`,
        );
      }

      if (!validSnapshotEffectiveDates.has(version.effectiveDate)) {
        errors.push(
          `${prefix}.effectiveDate ${version.effectiveDate} does not have a generated snapshot`,
        );
      }
    }
  }

  for (const snapshot of schematicMap.versionSnapshots) {
    snapshot.value.lineGroups.forEach((lineGroup, index) => {
      requireLineId(
        `${snapshot.path}: lineGroups.${index}.lineId`,
        lineGroup.lineId,
      );
    });

    snapshot.value.segments.forEach((segment, index) => {
      const prefix = `${snapshot.path}: segments.${index}`;
      requireLineId(`${prefix}.lineId`, segment.lineId);

      if (segment.topology.type === 'station_pair') {
        requireStationId(
          `${prefix}.topology.fromStationId`,
          segment.topology.fromStationId,
        );
        requireStationId(
          `${prefix}.topology.toStationId`,
          segment.topology.toStationId,
        );
      } else if (segment.topology.stationIds) {
        segment.topology.stationIds.forEach((stationId, stationIndex) => {
          requireStationId(
            `${prefix}.topology.stationIds.${stationIndex}`,
            stationId,
          );
        });
      }
    });

    snapshot.value.stationNodes.forEach((node, index) => {
      const prefix = `${snapshot.path}: stationNodes.${index}`;
      requireStationId(`${prefix}.stationId`, node.stationId);
      node.lineIds.forEach((lineId, lineIndex) => {
        requireLineId(`${prefix}.lineIds.${lineIndex}`, lineId);
        requireStationLineId(
          `${prefix}.lineIds.${lineIndex}`,
          node.stationId,
          lineId,
        );
      });
      node.parts.forEach((part, partIndex) => {
        requireLineId(`${prefix}.parts.${partIndex}.lineId`, part.lineId);
        requireStationLineId(
          `${prefix}.parts.${partIndex}.lineId`,
          node.stationId,
          part.lineId,
        );
      });
    });

    snapshot.value.labels.forEach((label, index) => {
      requireStationId(
        `${snapshot.path}: labels.${index}.stationId`,
        label.stationId,
      );
    });

    snapshot.value.stationCodeLabels.forEach((label, index) => {
      const prefix = `${snapshot.path}: stationCodeLabels.${index}`;
      requireStationId(`${prefix}.stationId`, label.stationId);
      requireLineId(`${prefix}.lineId`, label.lineId);
      requireStationLineId(`${prefix}.lineId`, label.stationId, label.lineId);
    });
  }

  return errors;
}

export async function validateDataRoot(
  dataDir: string,
  scopes: readonly ValidationScope[] = [
    ...entityCollections,
    issueDirectory,
    schematicMapDirectory,
  ],
): Promise<ValidationResult> {
  const checked = emptyChecked();
  const errors: string[] = [];
  const records: ValidationRecords = {};

  for (const scope of scopes) {
    try {
      if (scope === 'issue') {
        const bundles = await loadIssueRecords(dataDir, records);
        checked.issue = bundles.length;
        continue;
      }

      if (scope === 'schematic-map') {
        const schematicMap = await loadSchematicMapRecords(dataDir, records);
        checked['schematic-map'] =
          (schematicMap.manifest ? 1 : 0) +
          schematicMap.ruleSets.length +
          schematicMap.constraintSets.length +
          schematicMap.versionSnapshots.length;
        continue;
      }

      const scopeRecords = await loadEntityRecords(dataDir, records, scope);
      checked[scope] = scopeRecords.length;
    } catch (error) {
      errors.push(`${scope}: ${formatError(error)}`);
    }
  }

  try {
    errors.push(
      ...(await validateStationReferences(
        dataDir,
        shouldValidateScope(scopes, 'station'),
        records,
      )),
    );
    errors.push(
      ...(await validateLineReferences(
        dataDir,
        shouldValidateScope(scopes, 'line'),
        records,
      )),
    );
    errors.push(
      ...(await validateServiceReferences(
        dataDir,
        shouldValidateScope(scopes, 'service'),
        records,
      )),
    );
    errors.push(
      ...(await validateIssueReferences(
        dataDir,
        shouldValidateScope(scopes, 'issue'),
        records,
      )),
    );
    errors.push(
      ...(await validateSchematicMapReferences(
        dataDir,
        shouldValidateScope(scopes, 'schematic-map'),
        records,
      )),
    );
  } catch (error) {
    errors.push(`references: ${formatError(error)}`);
  }

  return {
    ok: errors.length === 0,
    checked,
    errors,
  };
}
