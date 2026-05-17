import type { IssueBundle } from '@mrtdown/core';
import type { z } from 'zod';
import {
  type EntityCollection,
  entityCollections,
  evidenceFileName,
  impactFileName,
  issueDirectory,
} from './constants.js';
import { type EntityRecord, listEntities } from './entities.js';
import { listIssueBundles } from './issues.js';

export type ValidationScope = EntityCollection | 'issue';

export type ValidationResult = {
  ok: boolean;
  checked: Record<ValidationScope, number>;
  errors: string[];
};

function emptyChecked(): Record<ValidationScope, number> {
  return Object.fromEntries(
    [...entityCollections, issueDirectory].map((scope) => [scope, 0]),
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
}>;

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
            stationCodeOverlapsRevision(
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

function stationCodeOverlapsRevision(
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

  return revisionStart < stationCodeEnd && stationCodeStart < revisionEnd;
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

export async function validateDataRoot(
  dataDir: string,
  scopes: readonly ValidationScope[] = [...entityCollections, issueDirectory],
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
  } catch (error) {
    errors.push(`references: ${formatError(error)}`);
  }

  return {
    ok: errors.length === 0,
    checked,
    errors,
  };
}
