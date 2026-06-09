import type {
  ImpactEvent,
  IssueBundle,
  SchematicMapConstraintSet,
  SchematicMapCoordinateMetadata,
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

function describeImpactEventEntity(entity: ImpactEvent['entity']): string {
  switch (entity.type) {
    case 'service':
      return `service ${entity.serviceId}`;
    case 'facility':
      return `facility ${entity.stationId}/${entity.lineId ?? '*'}/${entity.kind}`;
  }
}

function impactEventSetterKey(event: ImpactEvent): string {
  return [event.type, describeImpactEventEntity(event.entity), event.ts].join(
    '|',
  );
}

function validateDuplicateValue(
  errors: string[],
  path: string,
  label: string,
  values: Iterable<[number, string]>,
): void {
  const seen = new Map<string, number>();

  for (const [index, value] of values) {
    const previousIndex = seen.get(value);
    if (previousIndex != null) {
      errors.push(
        `${path}: ${label}.${index} duplicates ${value} (first seen at ${label}.${previousIndex})`,
      );
    } else {
      seen.set(value, index);
    }
  }
}

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
  const serviceRecords = await loadEntityRecords(dataDir, records, 'service');
  const serviceById = new Map(
    serviceRecords.map((service) => [service.value.id, service]),
  );
  const townIds = await loadEntityIds(dataDir, records, 'town');
  const errors: string[] = [];
  const validationTimestamp = Date.now();

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

    const layoutPlatformServiceIds = new Set<string>();
    const layout = station.value.layout;
    if (layout) {
      validateDuplicateValue(
        errors,
        station.path,
        'layout.levels',
        layout.levels.map((level, index) => [index, level.id]),
      );
      validateDuplicateValue(
        errors,
        station.path,
        'layout.exits',
        layout.exits.map((exit, index) => [index, exit.id]),
      );
      validateDuplicateValue(
        errors,
        station.path,
        'layout.exits.label',
        layout.exits.map((exit, index) => [
          index,
          exit.label.trim().toLowerCase(),
        ]),
      );
      validateDuplicateValue(
        errors,
        station.path,
        'layout.platforms',
        layout.platforms.map((platform, index) => [index, platform.id]),
      );
      validateDuplicateValue(
        errors,
        station.path,
        'layout.transferPaths',
        layout.transferPaths.map((transferPath, index) => [
          index,
          transferPath.id,
        ]),
      );

      const layoutLevelIds = new Set(layout.levels.map((level) => level.id));
      const layoutPlatformIds = new Set(
        layout.platforms.map((platform) => platform.id),
      );
      const layoutAccessPointIds = new Set<string>();

      for (const [platformIndex, platform] of layout.platforms.entries()) {
        for (const [
          accessPointIndex,
          accessPoint,
        ] of platform.accessPoints.entries()) {
          const previousSize = layoutAccessPointIds.size;
          layoutAccessPointIds.add(accessPoint.id);
          if (layoutAccessPointIds.size === previousSize) {
            errors.push(
              `${station.path}: layout.platforms.${platformIndex}.accessPoints.${accessPointIndex}.id ${accessPoint.id} duplicates another access point id in layout`,
            );
          }

          if (
            accessPoint.connectsToLevelId &&
            !layoutLevelIds.has(accessPoint.connectsToLevelId)
          ) {
            errors.push(
              `${station.path}: layout.platforms.${platformIndex}.accessPoints.${accessPointIndex}.connectsToLevelId ${accessPoint.connectsToLevelId} does not exist in layout.levels`,
            );
          }

          const numericDoor = accessPoint.nearestDoor
            ? Number(accessPoint.nearestDoor)
            : Number.NaN;
          if (
            platform.doorCount != null &&
            Number.isInteger(numericDoor) &&
            (numericDoor < 1 || numericDoor > platform.doorCount)
          ) {
            errors.push(
              `${station.path}: layout.platforms.${platformIndex}.accessPoints.${accessPointIndex}.nearestDoor ${accessPoint.nearestDoor} is outside doorCount ${platform.doorCount}`,
            );
          }
        }
      }

      for (const [exitIndex, exit] of layout.exits.entries()) {
        if (exit.levelId && !layoutLevelIds.has(exit.levelId)) {
          errors.push(
            `${station.path}: layout.exits.${exitIndex}.levelId ${exit.levelId} does not exist in layout.levels`,
          );
        }

        for (const [landmarkIndex, landmarkId] of (
          exit.nearbyLandmarkIds ?? []
        ).entries()) {
          if (!landmarkIds.has(landmarkId)) {
            errors.push(
              `${station.path}: layout.exits.${exitIndex}.nearbyLandmarkIds.${landmarkIndex} ${landmarkId} does not exist in landmark/`,
            );
          }
        }
      }

      for (const [platformIndex, platform] of layout.platforms.entries()) {
        if (!lineIds.has(platform.lineId)) {
          errors.push(
            `${station.path}: layout.platforms.${platformIndex}.lineId ${platform.lineId} does not exist in line/`,
          );
        }

        if (platform.levelId && !layoutLevelIds.has(platform.levelId)) {
          errors.push(
            `${station.path}: layout.platforms.${platformIndex}.levelId ${platform.levelId} does not exist in layout.levels`,
          );
        }

        for (const [serviceIndex, serviceId] of platform.serviceIds.entries()) {
          layoutPlatformServiceIds.add(serviceId);
          const service = serviceById.get(serviceId);
          if (!service) {
            errors.push(
              `${station.path}: layout.platforms.${platformIndex}.serviceIds.${serviceIndex} ${serviceId} does not exist in service/`,
            );
            continue;
          }

          if (service.value.lineId !== platform.lineId) {
            errors.push(
              `${station.path}: layout.platforms.${platformIndex}.serviceIds.${serviceIndex} ${serviceId} belongs to line ${service.value.lineId}, not ${platform.lineId}`,
            );
            continue;
          }

          const currentRevisions = service.value.revisions.filter((revision) =>
            revisionContainsTimestamp(revision, validationTimestamp),
          );
          if (currentRevisions.length === 0) {
            errors.push(
              `${station.path}: layout.platforms.${platformIndex}.serviceIds.${serviceIndex} ${serviceId} does not have a current service revision`,
            );
            continue;
          }

          for (const revision of currentRevisions) {
            const stationIds = new Set(
              revision.path.stations.map(
                (serviceStation) => serviceStation.stationId,
              ),
            );

            if (!stationIds.has(station.value.id)) {
              errors.push(
                `${station.path}: layout.platforms.${platformIndex}.serviceIds.${serviceIndex} ${serviceId} revision ${revision.id} does not include station ${station.value.id} in its current service path`,
              );
            }
          }
        }
      }

      for (const [
        transferPathIndex,
        transferPath,
      ] of layout.transferPaths.entries()) {
        for (const [endpointName, endpoint] of [
          ['from', transferPath.from],
          ['to', transferPath.to],
        ] as const) {
          const endpointExists =
            (endpoint.kind === 'level' && layoutLevelIds.has(endpoint.id)) ||
            (endpoint.kind === 'platform' &&
              layoutPlatformIds.has(endpoint.id)) ||
            (endpoint.kind === 'access_point' &&
              layoutAccessPointIds.has(endpoint.id));

          if (!endpointExists) {
            errors.push(
              `${station.path}: layout.transferPaths.${transferPathIndex}.${endpointName} ${endpoint.kind} ${endpoint.id} does not exist in layout`,
            );
          }
        }
      }
    }

    const seenFirstLastTrainServices = new Map<string, number>();
    for (const [index, serviceTiming] of (
      station.value.firstLastTrain?.services ?? []
    ).entries()) {
      const previousIndex = seenFirstLastTrainServices.get(
        serviceTiming.serviceId,
      );
      if (previousIndex != null) {
        errors.push(
          `${station.path}: firstLastTrain.services.${index}.serviceId ${serviceTiming.serviceId} duplicates firstLastTrain.services.${previousIndex}.serviceId`,
        );
      } else {
        seenFirstLastTrainServices.set(serviceTiming.serviceId, index);
      }

      if (layout && !layoutPlatformServiceIds.has(serviceTiming.serviceId)) {
        errors.push(
          `${station.path}: firstLastTrain.services.${index}.serviceId ${serviceTiming.serviceId} is not served by any layout platform`,
        );
      }

      const service = serviceById.get(serviceTiming.serviceId);
      if (!service) {
        errors.push(
          `${station.path}: firstLastTrain.services.${index}.serviceId ${serviceTiming.serviceId} does not exist in service/`,
        );
        continue;
      }

      const currentRevisions = service.value.revisions.filter((revision) =>
        revisionContainsTimestamp(revision, validationTimestamp),
      );
      if (currentRevisions.length === 0) {
        errors.push(
          `${station.path}: firstLastTrain.services.${index}.serviceId ${serviceTiming.serviceId} does not have a current service revision`,
        );
        continue;
      }

      for (const revision of currentRevisions) {
        const stationIds = new Set(
          revision.path.stations.map(
            (serviceStation) => serviceStation.stationId,
          ),
        );

        if (!stationIds.has(station.value.id)) {
          errors.push(
            `${station.path}: firstLastTrain.services.${index}.serviceId ${serviceTiming.serviceId} revision ${revision.id} does not include station ${station.value.id} in its current service path`,
          );
        }
      }
    }
  }

  return errors;
}

function revisionContainsTimestamp(
  revision: { startAt: string; endAt: string | null },
  timestamp: number,
): boolean {
  const start = timestampForValidation(revision.startAt);
  const end = revision.endAt
    ? timestampForValidation(revision.endAt)
    : Number.POSITIVE_INFINITY;

  return start <= timestamp && timestamp < end;
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

function stationPairKey(fromStationId: string, toStationId: string): string {
  return [fromStationId, toStationId].sort().join(':');
}

function effectiveMonthIntervalForValidation(effectiveDate: string): {
  start: number;
  end: number;
} {
  const [year, month] = effectiveDate.split('-').map(Number);
  if (!year || !month) {
    throw new Error(`Invalid effective date for validation: ${effectiveDate}`);
  }

  return {
    start: Date.UTC(year, month - 1, 1),
    end: Date.UTC(year, month, 1),
  };
}

function intervalContainsEffectiveDate(
  startedAt: string,
  endedAt: string | null,
  effectiveDate: string,
): boolean {
  const effectiveMonth = effectiveMonthIntervalForValidation(effectiveDate);
  const startedAtTimestamp = timestampForValidation(startedAt);
  const endedAtTimestamp = endedAt
    ? timestampForValidation(endedAt)
    : Number.POSITIVE_INFINITY;

  return (
    startedAtTimestamp < effectiveMonth.end &&
    effectiveMonth.start < endedAtTimestamp
  );
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
    const seenImpactEventSetters = new Map<string, string>();

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

      const setterKey = impactEventSetterKey(event);
      const previousSetterLocation = seenImpactEventSetters.get(setterKey);
      if (previousSetterLocation) {
        errors.push(
          `${linePrefix}: ${event.type} for ${describeImpactEventEntity(event.entity)} has the same ts as ${previousSetterLocation}; setter events for the same entity and type need distinct timestamps`,
        );
      } else {
        seenImpactEventSetters.set(setterKey, linePrefix);
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
  const serviceRecords = await loadEntityRecords(dataDir, records, 'service');
  const serviceEdgesByLineAndEffectiveDate = new Map<string, Set<string>>();
  const schematicMap = await loadSchematicMapRecords(dataDir, records);
  const constraintIdsByEffectiveDate = new Map<string, Set<string>>();
  const errors: string[] = [];

  const serviceEdgesForLineAtEffectiveDate = (
    lineId: string,
    effectiveDate: string,
  ): Set<string> => {
    const cacheKey = `${lineId}:${effectiveDate}`;
    const cached = serviceEdgesByLineAndEffectiveDate.get(cacheKey);
    if (cached) {
      return cached;
    }

    const serviceEdges = new Set<string>();

    for (const service of serviceRecords) {
      if (service.value.lineId !== lineId) {
        continue;
      }

      for (const revision of service.value.revisions) {
        if (
          !intervalContainsEffectiveDate(
            revision.startAt,
            revision.endAt,
            effectiveDate,
          )
        ) {
          continue;
        }

        const stations = revision.path.stations.map(
          (station) => station.stationId,
        );
        for (let index = 0; index < stations.length - 1; index += 1) {
          serviceEdges.add(
            stationPairKey(stations[index], stations[index + 1]),
          );
        }
      }
    }

    serviceEdgesByLineAndEffectiveDate.set(cacheKey, serviceEdges);
    return serviceEdges;
  };

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
    effectiveDate: string,
    options: { requireActive: boolean } = { requireActive: true },
  ) => {
    const station = stationById.get(stationId);
    if (!station) {
      return;
    }

    const matchingCodes = station.value.stationCodes.filter(
      (code) => code.lineId === lineId,
    );

    if (matchingCodes.length === 0) {
      errors.push(
        `${path} ${lineId} is not a station code line for station ${stationId}`,
      );
      return;
    }

    if (
      options.requireActive &&
      !matchingCodes.some((code) =>
        intervalContainsEffectiveDate(
          code.startedAt,
          code.endedAt,
          effectiveDate,
        ),
      )
    ) {
      errors.push(
        `${path} ${lineId} is not an active station code line for station ${stationId} at ${effectiveDate}`,
      );
    }
  };

  const requireKnownConstraintCoordinateMetadata = (
    path: string,
    coordinateMetadata: SchematicMapCoordinateMetadata | undefined,
    effectiveDate: string,
  ) => {
    if (coordinateMetadata?.coordinateClass !== 'constraint') {
      return;
    }

    const constraintIds = constraintIdsByEffectiveDate.get(effectiveDate);
    if (!constraintIds?.has(coordinateMetadata.constraintId)) {
      errors.push(
        `${path}.constraintId ${coordinateMetadata.constraintId} does not exist in schematic map constraints for ${effectiveDate}`,
      );
    }
  };

  const availableLayoutEngineIds = new Set<string>();
  const referencedLayoutEngineIds: Array<{ id: string; path: string }> = [];

  for (const ruleSet of schematicMap.ruleSets) {
    const expectedPath = schematicSystemMapRuleSetPath(
      ruleSet.value.layoutEngineId,
    );

    if (ruleSet.path === expectedPath) {
      availableLayoutEngineIds.add(ruleSet.value.layoutEngineId);
    } else {
      errors.push(
        `${ruleSet.path}: layoutEngineId ${ruleSet.value.layoutEngineId} does not match ${expectedPath}`,
      );
    }

    ruleSet.value.lineOrder.forEach((lineId, index) => {
      requireLineId(`${ruleSet.path}: lineOrder.${index}`, lineId);
    });
  }

  for (const constraintSet of schematicMap.constraintSets) {
    referencedLayoutEngineIds.push({
      id: constraintSet.value.layoutEngineId,
      path: `${constraintSet.path}: layoutEngineId`,
    });

    const expectedPath = schematicSystemMapConstraintSetPath(
      constraintSet.value.effectiveDate,
    );

    if (constraintSet.path !== expectedPath) {
      errors.push(
        `${constraintSet.path}: effectiveDate ${constraintSet.value.effectiveDate} does not match ${expectedPath}`,
      );
    }

    constraintIdsByEffectiveDate.set(
      constraintSet.value.effectiveDate,
      new Set(
        constraintSet.value.constraints.map((constraint) => constraint.id),
      ),
    );

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
        requireStationLineId(
          `${prefix}.fromStationId`,
          constraint.fromStationId,
          constraint.lineId,
          constraintSet.value.effectiveDate,
          { requireActive: false },
        );
        requireStationId(`${prefix}.toStationId`, constraint.toStationId);
        requireStationLineId(
          `${prefix}.toStationId`,
          constraint.toStationId,
          constraint.lineId,
          constraintSet.value.effectiveDate,
          { requireActive: false },
        );
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
          requireStationLineId(
            `${prefix}.lineIds.${lineIndex}`,
            constraint.stationId,
            lineId,
            constraintSet.value.effectiveDate,
            { requireActive: false },
          );
        });
      }
    }
  }

  const validSnapshotEffectiveDates = new Set<string>();
  const snapshotLayoutEngineIds = new Map<string, string>();

  for (const snapshot of schematicMap.versionSnapshots) {
    referencedLayoutEngineIds.push({
      id: snapshot.value.layoutEngineId,
      path: `${snapshot.path}: layoutEngineId`,
    });

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
    snapshotLayoutEngineIds.set(
      snapshot.value.effectiveDate,
      snapshot.value.layoutEngineId,
    );
  }

  const manifestEffectiveDates = new Set<string>();

  if (schematicMap.manifest) {
    for (const [
      index,
      version,
    ] of schematicMap.manifest.value.versions.entries()) {
      const prefix = `${schematicMap.manifest.path}: versions.${index}`;
      const expectedMapRelativePath = `version/${version.effectiveDate}.json`;
      manifestEffectiveDates.add(version.effectiveDate);
      referencedLayoutEngineIds.push({
        id: version.layoutEngineId,
        path: `${prefix}.layoutEngineId`,
      });

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

      const snapshotLayoutEngineId = snapshotLayoutEngineIds.get(
        version.effectiveDate,
      );
      if (
        snapshotLayoutEngineId &&
        snapshotLayoutEngineId !== version.layoutEngineId
      ) {
        errors.push(
          `${prefix}.layoutEngineId ${version.layoutEngineId} does not match version/${version.effectiveDate}.json (${snapshotLayoutEngineId})`,
        );
      }
    }
  }

  for (const snapshot of schematicMap.versionSnapshots) {
    if (!manifestEffectiveDates.has(snapshot.value.effectiveDate)) {
      errors.push(
        `${snapshot.path}: effectiveDate ${snapshot.value.effectiveDate} is not listed in schematic map manifest`,
      );
    }
  }

  for (const reference of referencedLayoutEngineIds) {
    if (!availableLayoutEngineIds.has(reference.id)) {
      errors.push(
        `${reference.path} ${reference.id} does not have a schematic map rule set`,
      );
    }
  }

  for (const snapshot of schematicMap.versionSnapshots) {
    requireKnownConstraintCoordinateMetadata(
      `${snapshot.path}: frame.coordinateMetadata`,
      snapshot.value.frame.coordinateMetadata,
      snapshot.value.effectiveDate,
    );

    snapshot.value.lineGroups.forEach((lineGroup, index) => {
      requireLineId(
        `${snapshot.path}: lineGroups.${index}.lineId`,
        lineGroup.lineId,
      );
    });

    snapshot.value.segments.forEach((segment, index) => {
      const prefix = `${snapshot.path}: segments.${index}`;
      requireLineId(`${prefix}.lineId`, segment.lineId);
      requireKnownConstraintCoordinateMetadata(
        `${prefix}.geometry.coordinateMetadata`,
        segment.geometry.coordinateMetadata,
        snapshot.value.effectiveDate,
      );

      if (segment.topology.type === 'station_pair') {
        requireStationId(
          `${prefix}.topology.fromStationId`,
          segment.topology.fromStationId,
        );
        requireStationLineId(
          `${prefix}.topology.fromStationId`,
          segment.topology.fromStationId,
          segment.lineId,
          snapshot.value.effectiveDate,
          { requireActive: segment.displayStatus === 'operational' },
        );
        requireStationId(
          `${prefix}.topology.toStationId`,
          segment.topology.toStationId,
        );
        requireStationLineId(
          `${prefix}.topology.toStationId`,
          segment.topology.toStationId,
          segment.lineId,
          snapshot.value.effectiveDate,
          { requireActive: segment.displayStatus === 'operational' },
        );

        const serviceEdges = serviceEdgesForLineAtEffectiveDate(
          segment.lineId,
          snapshot.value.effectiveDate,
        );
        const segmentPairKey = stationPairKey(
          segment.topology.fromStationId,
          segment.topology.toStationId,
        );

        if (
          segment.displayStatus === 'operational' &&
          !serviceEdges?.has(segmentPairKey)
        ) {
          errors.push(
            `${prefix}.topology ${segment.topology.fromStationId}:${segment.topology.toStationId} is not an adjacent service edge for line ${segment.lineId}`,
          );
        }
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
          snapshot.value.effectiveDate,
          { requireActive: node.displayStatus === 'operational' },
        );
      });
      node.parts.forEach((part, partIndex) => {
        requireLineId(`${prefix}.parts.${partIndex}.lineId`, part.lineId);
        requireStationLineId(
          `${prefix}.parts.${partIndex}.lineId`,
          node.stationId,
          part.lineId,
          snapshot.value.effectiveDate,
          { requireActive: node.displayStatus === 'operational' },
        );
        requireKnownConstraintCoordinateMetadata(
          `${prefix}.parts.${partIndex}.coordinateMetadata`,
          part.coordinateMetadata,
          snapshot.value.effectiveDate,
        );
      });
      requireKnownConstraintCoordinateMetadata(
        `${prefix}.coordinateMetadata`,
        node.coordinateMetadata,
        snapshot.value.effectiveDate,
      );
    });

    snapshot.value.labels.forEach((label, index) => {
      const prefix = `${snapshot.path}: labels.${index}`;
      requireStationId(`${prefix}.stationId`, label.stationId);
      requireKnownConstraintCoordinateMetadata(
        `${prefix}.leaderLine.coordinateMetadata`,
        label.leaderLine?.coordinateMetadata,
        snapshot.value.effectiveDate,
      );
      requireKnownConstraintCoordinateMetadata(
        `${prefix}.coordinateMetadata`,
        label.coordinateMetadata,
        snapshot.value.effectiveDate,
      );
    });

    snapshot.value.stationCodeLabels.forEach((label, index) => {
      const prefix = `${snapshot.path}: stationCodeLabels.${index}`;
      requireStationId(`${prefix}.stationId`, label.stationId);
      requireLineId(`${prefix}.lineId`, label.lineId);
      requireStationLineId(
        `${prefix}.lineId`,
        label.stationId,
        label.lineId,
        snapshot.value.effectiveDate,
        { requireActive: label.displayStatus === 'operational' },
      );
      requireKnownConstraintCoordinateMetadata(
        `${prefix}.coordinateMetadata`,
        label.coordinateMetadata,
        snapshot.value.effectiveDate,
      );
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
