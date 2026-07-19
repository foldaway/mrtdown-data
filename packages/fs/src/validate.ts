import { resolve } from 'node:path';
import type {
  ImpactEvent,
  IssueBundle,
  SchematicMapConstraintSet,
  SchematicMapCoordinateMetadata,
  SchematicMapManifest,
  SchematicMapRuleSet,
  SchematicMapVersionSnapshot,
  SourceRegistry,
} from '@mrtdown/core';
import { SourceRegistrySchema } from '@mrtdown/core';
import type { z } from 'zod';
import {
  type EntityCollection,
  entityCollections,
  evidenceFileName,
  impactFileName,
  issueDirectory,
  rightsDirectory,
  schematicMapDirectory,
  sourceRegistryFileName,
} from './constants.js';
import { type EntityRecord, listEntities } from './entities.js';
import { listIssueBundles } from './issues.js';
import { readJsonFile } from './json.js';
import { resolveSourceRegistryRule } from './rights.js';
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

export type ValidationScope =
  | EntityCollection
  | 'issue'
  | 'rights'
  | 'schematic-map';

export type ValidationResult = {
  ok: boolean;
  checked: Record<ValidationScope, number>;
  errors: string[];
};

function emptyChecked(): Record<ValidationScope, number> {
  return Object.fromEntries(
    [
      ...entityCollections,
      issueDirectory,
      rightsDirectory,
      schematicMapDirectory,
    ].map((scope) => [scope, 0]),
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
  rights: SourceRegistry;
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

function normalizeStationAlias(alias: string): string {
  return alias.trim().replace(/\s+/g, ' ').toLowerCase();
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

async function loadSourceRegistry(
  dataDir: string,
  records: ValidationRecords,
): Promise<SourceRegistry> {
  if (!records.rights) {
    records.rights = await readJsonFile(
      resolve(dataDir, rightsDirectory, sourceRegistryFileName),
      SourceRegistrySchema,
    );
  }
  return records.rights;
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
  const seenStationAliases = new Map<string, { path: string; index: number }>();
  const seenLayoutSourceObjectIds = new Map<number, string>();

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

    validateDuplicateValue(
      errors,
      station.path,
      'aliases',
      (station.value.aliases ?? []).map((alias, index) => [
        index,
        normalizeStationAlias(alias),
      ]),
    );

    for (const [index, alias] of (station.value.aliases ?? []).entries()) {
      const normalizedAlias = normalizeStationAlias(alias);
      const previous = seenStationAliases.get(normalizedAlias);
      if (previous && previous.path !== station.path) {
        errors.push(
          `${station.path}: aliases.${index} duplicates ${normalizedAlias} from ${previous.path}:aliases.${previous.index}`,
        );
      } else if (!previous) {
        seenStationAliases.set(normalizedAlias, {
          path: station.path,
          index,
        });
      }
    }

    const layout = station.value.layout;
    if (layout) {
      validateDuplicateValue(
        errors,
        station.path,
        'layout.exits.sourceObjectId',
        layout.exits.map((exit, index) => [index, String(exit.sourceObjectId)]),
      );

      for (const [exitIndex, exit] of layout.exits.entries()) {
        const previousStationPath = seenLayoutSourceObjectIds.get(
          exit.sourceObjectId,
        );
        if (previousStationPath && previousStationPath !== station.path) {
          errors.push(
            `${station.path}: layout.exits.${exitIndex}.sourceObjectId ${exit.sourceObjectId} is already used by ${previousStationPath}`,
          );
        } else if (!previousStationPath) {
          seenLayoutSourceObjectIds.set(exit.sourceObjectId, station.path);
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

      const service = serviceById.get(serviceTiming.serviceId);
      if (!service) {
        errors.push(
          `${station.path}: firstLastTrain.services.${index}.serviceId ${serviceTiming.serviceId} does not exist in service/`,
        );
        continue;
      }

      if (!serviceIncludesStation(service.value, station.value.id)) {
        errors.push(
          `${station.path}: firstLastTrain.services.${index}.serviceId ${serviceTiming.serviceId} does not include station ${station.value.id} in any service revision`,
        );
      }
    }
  }

  return errors;
}

function serviceIncludesStation(
  service: {
    revisions: Array<{ path: { stations: Array<{ stationId: string }> } }>;
  },
  stationId: string,
): boolean {
  return service.revisions.some((revision) =>
    revision.path.stations.some((station) => station.stationId === stationId),
  );
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
  const stationCodeStart =
    singaporeDateTimestampForValidation(stationCodeStartedAt);
  const revisionStart = singaporeDateTimestampForValidation(revisionStartAt);
  const stationCodeEnd = stationCodeEndedAt
    ? singaporeDateTimestampForValidation(stationCodeEndedAt)
    : Number.POSITIVE_INFINITY;
  const revisionEnd = revisionEndAt
    ? singaporeDateTimestampForValidation(revisionEndAt)
    : Number.POSITIVE_INFINITY;

  return stationCodeStart <= revisionStart && revisionEnd <= stationCodeEnd;
}

function singaporeDateTimestampForValidation(value: string): number {
  // Station-code and service-revision dates are implicitly Asia/Singapore.
  return timestampForValidation(`${value}T00:00:00+08:00`);
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

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return {
    start: singaporeDateTimestampForValidation(
      `${year}-${String(month).padStart(2, '0')}-01`,
    ),
    end: singaporeDateTimestampForValidation(
      `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
    ),
  };
}

function intervalContainsEffectiveDate(
  startedAt: string,
  endedAt: string | null,
  effectiveDate: string,
): boolean {
  const effectiveMonth = effectiveMonthIntervalForValidation(effectiveDate);
  const startedAtTimestamp = singaporeDateTimestampForValidation(startedAt);
  const endedAtTimestamp = endedAt
    ? singaporeDateTimestampForValidation(endedAt)
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

  const services = await loadEntityRecords(dataDir, records, 'service');
  const servicesById = new Map(
    services.map((service) => [service.value.id, service.value]),
  );
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
        const service = servicesById.get(event.entity.serviceId);
        if (service == null) {
          errors.push(
            `${linePrefix}: entity.serviceId ${event.entity.serviceId} does not exist in service/`,
          );
        } else if (event.type === 'periods.set') {
          for (const [periodIndex, period] of event.periods.entries()) {
            if (
              !service.revisions.some((revision) =>
                serviceRevisionContainsTimestamp(
                  revision.startAt,
                  revision.endAt,
                  period.startAt,
                ),
              )
            ) {
              errors.push(
                `${linePrefix}: periods.${periodIndex}.startAt ${period.startAt} is outside service ${event.entity.serviceId} revision windows`,
              );
            }
          }
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

function serviceRevisionContainsTimestamp(
  revisionStartAt: string,
  revisionEndAt: string | null,
  timestamp: string,
): boolean {
  const revisionStart = singaporeDateTimestampForValidation(revisionStartAt);
  const revisionEnd = revisionEndAt
    ? singaporeDateTimestampForValidation(revisionEndAt)
    : Number.POSITIVE_INFINITY;
  const instant = timestampForValidation(timestamp);

  return revisionStart <= instant && instant < revisionEnd;
}

async function validateEvidenceRights(
  dataDir: string,
  shouldValidate: boolean,
  records: ValidationRecords,
): Promise<string[]> {
  if (!shouldValidate) {
    return [];
  }

  const sourceRegistry = await loadSourceRegistry(dataDir, records);
  const errors: string[] = [];

  for (const bundle of await loadIssueRecords(dataDir, records)) {
    const evidencePath = `${bundle.path}/${evidenceFileName}`;

    for (const [evidenceIndex, evidence] of bundle.evidence.entries()) {
      const location = `${evidencePath}:${evidenceIndex + 1}`;
      const result = resolveSourceRegistryRule(sourceRegistry, evidence);

      if (!result.ok) {
        errors.push(
          `${location}: evidence source rights ${result.reason} for ${evidence.sourceUrl}`,
        );
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
    rightsDirectory,
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

      if (scope === 'rights') {
        await loadSourceRegistry(dataDir, records);
        checked.rights = 1;
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
      ...(await validateEvidenceRights(
        dataDir,
        shouldValidateScope(scopes, 'issue') &&
          shouldValidateScope(scopes, 'rights'),
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
