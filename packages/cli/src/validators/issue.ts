import { join } from 'node:path';
import type { ImpactEvent } from '@mrtdown/core';
import { EvidenceSchema, ImpactEventSchema, IssueSchema } from '@mrtdown/core';
import { DIR_ISSUE, type IStore } from '@mrtdown/fs';
import { NdJson } from 'json-nd';
import z from 'zod';
import type { ValidationContext, ValidationError } from './types.js';
import { loadJson } from './utils.js';

export function validateIssueSchema(data: unknown): ValidationError[] {
  const result = IssueSchema.safeParse(data);
  if (result.success) return [];
  return result.error.issues.map((i) => ({
    file: '',
    message: `${i.path.length > 0 ? i.path.join('.') : 'root'}: ${i.message}`,
  }));
}

export function validateEvidenceSchema(data: unknown): ValidationError[] {
  const result = EvidenceSchema.safeParse(data);
  if (result.success) return [];
  return result.error.issues.map((i) => ({
    file: '',
    message: `${i.path.length > 0 ? i.path.join('.') : 'root'}: ${i.message}`,
  }));
}

export function validateImpactEventSchema(data: unknown): ValidationError[] {
  const result = ImpactEventSchema.safeParse(data);
  if (result.success) return [];
  return result.error.issues.map((i) => ({
    file: '',
    message: `${i.path.length > 0 ? i.path.join('.') : 'root'}: ${i.message}`,
  }));
}

export function validateImpactEventRelationships(
  event: ImpactEvent,
  evidenceIds: Set<string>,
  file: string,
  lineNum: number,
  ctx?: ValidationContext,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!evidenceIds.has(event.basis.evidenceId)) {
    errors.push({
      file,
      line: lineNum,
      message: `basis.evidenceId "${event.basis.evidenceId}" does not exist in evidence`,
    });
  }

  if (!ctx) return errors;

  if (event.entity.type === 'service') {
    if (!ctx.serviceIds.has(event.entity.serviceId)) {
      errors.push({
        file,
        line: lineNum,
        message: `entity.serviceId "${event.entity.serviceId}" does not exist`,
      });
    }
  } else {
    if (!ctx.stationIds.has(event.entity.stationId)) {
      errors.push({
        file,
        line: lineNum,
        message: `entity.stationId "${event.entity.stationId}" does not exist`,
      });
    }
  }

  if ('serviceScopes' in event && event.serviceScopes) {
    for (const scope of event.serviceScopes) {
      if (scope.type === 'service.segment') {
        if (!ctx.stationIds.has(scope.fromStationId)) {
          errors.push({
            file,
            line: lineNum,
            message: `serviceScopes[].fromStationId "${scope.fromStationId}" does not exist`,
          });
        }
        if (!ctx.stationIds.has(scope.toStationId)) {
          errors.push({
            file,
            line: lineNum,
            message: `serviceScopes[].toStationId "${scope.toStationId}" does not exist`,
          });
        }
      } else if (scope.type === 'service.point') {
        if (!ctx.stationIds.has(scope.stationId)) {
          errors.push({
            file,
            line: lineNum,
            message: `serviceScopes[].stationId "${scope.stationId}" does not exist`,
          });
        }
      }
    }
  }

  return errors;
}

/** Ensures closed periods have end strictly after start (fixed + recurring outer bounds). */
function validateImpactEventPeriodOrdering(
  event: ImpactEvent,
  file: string,
  lineNum: number,
): ValidationError[] {
  if (event.type !== 'periods.set') return [];

  const errors: ValidationError[] = [];
  for (let j = 0; j < event.periods.length; j++) {
    const period = event.periods[j];
    const path = `periods[${j}]`;

    if (period.kind === 'fixed') {
      if (period.endAt == null) continue;
      const startMs = Date.parse(period.startAt);
      const endMs = Date.parse(period.endAt);
      if (endMs === startMs) {
        errors.push({
          file,
          line: lineNum,
          message: `${path}: fixed period has zero duration (endAt equals startAt)`,
        });
      } else if (endMs < startMs) {
        errors.push({
          file,
          line: lineNum,
          message: `${path}: fixed period endAt must be after startAt`,
        });
      }
    } else {
      const startMs = Date.parse(period.startAt);
      const endMs = Date.parse(period.endAt);
      if (endMs === startMs) {
        errors.push({
          file,
          line: lineNum,
          message: `${path}: recurring period has zero duration (endAt equals startAt)`,
        });
      } else if (endMs < startMs) {
        errors.push({
          file,
          line: lineNum,
          message: `${path}: recurring period endAt must be after startAt`,
        });
      }
    }
  }

  return errors;
}

/**
 * Ensures fixed open-ended periods (endAt = null) have startAt <= event ts.
 * A period recorded as ongoing must have already started; if startAt is in the
 * future relative to ts, evidence will time out before the period begins,
 * producing a zero-duration operational period.
 */
function validateImpactEventOpenEndedPeriodStart(
  event: ImpactEvent,
  file: string,
  lineNum: number,
): ValidationError[] {
  if (event.type !== 'periods.set') return [];

  const eventTs = Date.parse(event.ts);
  const errors: ValidationError[] = [];

  for (let j = 0; j < event.periods.length; j++) {
    const period = event.periods[j];
    if (period.kind !== 'fixed' || period.endAt != null) continue;

    const startMs = Date.parse(period.startAt);
    if (startMs > eventTs) {
      errors.push({
        file,
        line: lineNum,
        message: `periods[${j}]: open-ended fixed period has startAt (${period.startAt}) after event ts (${event.ts}); set an explicit endAt or wait until the period begins`,
      });
    }
  }

  return errors;
}

interface ImpactEventLoopState {
  /** Tracks the last periods.set per entity key (JSON) → { line, periodsJson }. */
  lastPeriodsSetByEntity: Map<string, { line: number; periodsJson: string }>;
  /** Tracks seen event fingerprints (ts+type+entity+payload, excl. id/basis) → first line. */
  seenEventFingerprints: Map<string, number>;
}

/**
 * Detects periods.set events that don't change the periods for their entity compared to
 * the previous periods.set for the same entity (no-op).
 * Updates state.lastPeriodsSetByEntity as a side-effect.
 */
function validateImpactEventNoOpPeriods(
  event: ImpactEvent,
  state: ImpactEventLoopState,
  file: string,
  lineNum: number,
): ValidationError[] {
  if (event.type !== 'periods.set') return [];

  const entityKey = JSON.stringify(event.entity);
  const periodsJson = JSON.stringify(event.periods);
  const prev = state.lastPeriodsSetByEntity.get(entityKey);

  state.lastPeriodsSetByEntity.set(entityKey, { line: lineNum, periodsJson });

  if (prev?.periodsJson === periodsJson) {
    return [
      {
        file,
        line: lineNum,
        message: `periods.set is identical to line ${prev.line} (no-op)`,
      },
    ];
  }

  return [];
}

/**
 * Detects exact duplicate impact events: same ts, type, entity, and payload
 * but different id/basis (usually from a duplicate evidence entry).
 * Updates state.seenEventFingerprints as a side-effect.
 */
function validateImpactEventNoDuplicate(
  event: ImpactEvent,
  state: ImpactEventLoopState,
  file: string,
  lineNum: number,
): ValidationError[] {
  const { id: _id, basis: _basis, ...rest } = event as Record<string, unknown>;
  const fingerprint = JSON.stringify(rest);

  const prevLine = state.seenEventFingerprints.get(fingerprint);
  state.seenEventFingerprints.set(fingerprint, lineNum);

  if (prevLine !== undefined) {
    return [
      {
        file,
        line: lineNum,
        message: `duplicate of line ${prevLine} (identical ts, type, entity, and payload)`,
      },
    ];
  }

  return [];
}

function validateIssueAtPath(
  store: IStore,
  relBase: string,
  ctx?: ValidationContext,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const issueJsonPath = join(relBase, 'issue.json');

  if (!store.exists(issueJsonPath)) {
    errors.push({
      file: issueJsonPath,
      message: 'Issue not found',
    });
    return errors;
  }

  const issueRaw = loadJson<unknown>(store, issueJsonPath);
  if (issueRaw) {
    const schemaErrs = validateIssueSchema(issueRaw);
    for (const e of schemaErrs) {
      errors.push({ ...e, file: e.file || issueJsonPath });
    }
  } else {
    errors.push({
      file: issueJsonPath,
      message: 'Failed to parse JSON',
    });
  }

  const evidenceIdsFromCtx = ctx?.evidenceIdsByIssue.get(relBase);
  const evidenceIds =
    evidenceIdsFromCtx !== undefined ? evidenceIdsFromCtx : new Set<string>();
  const needToBuildEvidenceIds = evidenceIdsFromCtx === undefined;

  const evidencePath = join(relBase, 'evidence.ndjson');
  try {
    const content = store.readText(evidencePath).trim();
    if (content) {
      const parsed = NdJson.parse(content);
      for (let i = 0; i < parsed.length; i++) {
        const row = parsed[i];
        const schemaErrs = validateEvidenceSchema(row);
        for (const e of schemaErrs) {
          errors.push({
            ...e,
            file: evidencePath,
            line: i + 1,
          });
        }
        if (needToBuildEvidenceIds) {
          const idParsed = z.object({ id: z.string() }).safeParse(row);
          if (idParsed.success) evidenceIds.add(idParsed.data.id);
        }
      }
    }
  } catch {
    // ignore missing
  }

  const impactPath = join(relBase, 'impact.ndjson');
  try {
    const content = store.readText(impactPath).trim();
    if (content) {
      const parsed = NdJson.parse(content);
      const loopState: ImpactEventLoopState = {
        lastPeriodsSetByEntity: new Map(),
        seenEventFingerprints: new Map(),
      };
      for (let i = 0; i < parsed.length; i++) {
        const row = parsed[i];
        const impactParsed = ImpactEventSchema.safeParse(row);
        if (!impactParsed.success) {
          for (const issue of impactParsed.error.issues) {
            errors.push({
              file: impactPath,
              line: i + 1,
              message: `${issue.path.length > 0 ? issue.path.join('.') : 'root'}: ${issue.message}`,
            });
          }
          continue;
        }
        const event = impactParsed.data;
        errors.push(
          ...validateImpactEventPeriodOrdering(event, impactPath, i + 1),
        );
        errors.push(
          ...validateImpactEventOpenEndedPeriodStart(event, impactPath, i + 1),
        );
        errors.push(
          ...validateImpactEventNoOpPeriods(
            event,
            loopState,
            impactPath,
            i + 1,
          ),
        );
        errors.push(
          ...validateImpactEventNoDuplicate(
            event,
            loopState,
            impactPath,
            i + 1,
          ),
        );
        errors.push(
          ...validateImpactEventRelationships(
            event,
            evidenceIds,
            impactPath,
            i + 1,
            ctx,
          ),
        );
      }
    }
  } catch {
    // ignore missing
  }

  return errors;
}

/**
 * Validates a single issue at the given path (e.g. "issue/2025/03/2025-03-11-x").
 * Pass ctx for relationship validation (serviceIds, stationIds, evidenceIds).
 */
export function validateIssue(
  store: IStore,
  relBase: string,
  ctx?: ValidationContext,
): ValidationError[] {
  return validateIssueAtPath(store, relBase, ctx);
}

export function validateIssues(
  store: IStore,
  ctx?: ValidationContext,
): ValidationError[] {
  const errors: ValidationError[] = [];
  try {
    const years = store.listDir(DIR_ISSUE);
    for (const year of years) {
      if (!/^\d{4}$/.test(year)) continue;
      const monthsPath = join(DIR_ISSUE, year);
      const months = store.listDir(monthsPath);
      for (const month of months) {
        if (!/^\d{2}$/.test(month)) continue;
        const issuesPath = join(monthsPath, month);
        const issues = store.listDir(issuesPath);
        for (const issueId of issues) {
          const relBase = join(DIR_ISSUE, year, month, issueId);
          errors.push(...validateIssueAtPath(store, relBase, ctx));
        }
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      errors.push({
        file: DIR_ISSUE,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return errors;
}
