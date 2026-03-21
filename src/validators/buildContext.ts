import { join } from 'node:path';
import { NdJson } from 'json-nd';
import z from 'zod';
import { LandmarkSchema } from '../schema/Landmark.js';
import { LineSchema } from '../schema/Line.js';
import { OperatorSchema } from '../schema/Operator.js';
import { ServiceSchema } from '../schema/Service.js';
import { StationSchema } from '../schema/Station.js';
import { TownSchema } from '../schema/Town.js';
import {
  DIR_ISSUE,
  DIR_LANDMARK,
  DIR_LINE,
  DIR_OPERATOR,
  DIR_SERVICE,
  DIR_STATION,
  DIR_TOWN,
} from '../constants.js';
import type { IStore } from '../repo/common/store.js';
import type { ValidationContext } from './types.js';
import { loadJson } from './utils.js';

/**
 * Loads all entity IDs from the store into a ValidationContext.
 * Use this to build context once, then pass it to validators for relationship checks.
 */
export function buildContext(store: IStore): ValidationContext {
  const ctx: ValidationContext = {
    townIds: new Set(),
    landmarkIds: new Set(),
    operatorIds: new Set(),
    lineIds: new Set(),
    serviceIds: new Set(),
    stationIds: new Set(),
    evidenceIdsByIssue: new Map(),
  };

  try {
    for (const file of store.listDir(DIR_TOWN)) {
      if (!file.endsWith('.json')) continue;
      const path = join(DIR_TOWN, file);
      const raw = loadJson<unknown>(store, path);
      const parsed = TownSchema.safeParse(raw);
      if (parsed.success) ctx.townIds.add(parsed.data.id);
      else
        console.warn(
          `[buildContext] Skipping invalid town: ${path}`,
          parsed.error?.message ?? parsed.error,
        );
    }
  } catch (err) {
    console.warn(
      '[buildContext] Failed to load towns:',
      err instanceof Error ? err.message : err,
    );
  }

  try {
    for (const file of store.listDir(DIR_LANDMARK)) {
      if (!file.endsWith('.json')) continue;
      const path = join(DIR_LANDMARK, file);
      const raw = loadJson<unknown>(store, path);
      const parsed = LandmarkSchema.safeParse(raw);
      if (parsed.success) ctx.landmarkIds.add(parsed.data.id);
      else
        console.warn(
          `[buildContext] Skipping invalid landmark: ${path}`,
          parsed.error?.message ?? parsed.error,
        );
    }
  } catch (err) {
    console.warn(
      '[buildContext] Failed to load landmarks:',
      err instanceof Error ? err.message : err,
    );
  }

  try {
    for (const file of store.listDir(DIR_OPERATOR)) {
      if (!file.endsWith('.json')) continue;
      const path = join(DIR_OPERATOR, file);
      const raw = loadJson<unknown>(store, path);
      const parsed = OperatorSchema.safeParse(raw);
      if (parsed.success) ctx.operatorIds.add(parsed.data.id);
      else
        console.warn(
          `[buildContext] Skipping invalid operator: ${path}`,
          parsed.error?.message ?? parsed.error,
        );
    }
  } catch (err) {
    console.warn(
      '[buildContext] Failed to load operators:',
      err instanceof Error ? err.message : err,
    );
  }

  try {
    for (const file of store.listDir(DIR_LINE)) {
      if (!file.endsWith('.json')) continue;
      const path = join(DIR_LINE, file);
      const raw = loadJson<unknown>(store, path);
      const parsed = LineSchema.safeParse(raw);
      if (parsed.success) ctx.lineIds.add(parsed.data.id);
      else
        console.warn(
          `[buildContext] Skipping invalid line: ${path}`,
          parsed.error?.message ?? parsed.error,
        );
    }
  } catch (err) {
    console.warn(
      '[buildContext] Failed to load lines:',
      err instanceof Error ? err.message : err,
    );
  }

  try {
    for (const file of store.listDir(DIR_STATION)) {
      if (!file.endsWith('.json')) continue;
      const path = join(DIR_STATION, file);
      const raw = loadJson<unknown>(store, path);
      const parsed = StationSchema.safeParse(raw);
      if (parsed.success) ctx.stationIds.add(parsed.data.id);
      else
        console.warn(
          `[buildContext] Skipping invalid station: ${path}`,
          parsed.error?.message ?? parsed.error,
        );
    }
  } catch (err) {
    console.warn(
      '[buildContext] Failed to load stations:',
      err instanceof Error ? err.message : err,
    );
  }

  try {
    for (const file of store.listDir(DIR_SERVICE)) {
      if (!file.endsWith('.json')) continue;
      const path = join(DIR_SERVICE, file);
      const raw = loadJson<unknown>(store, path);
      const parsed = ServiceSchema.safeParse(raw);
      if (parsed.success) ctx.serviceIds.add(parsed.data.id);
      else
        console.warn(
          `[buildContext] Skipping invalid service: ${path}`,
          parsed.error?.message ?? parsed.error,
        );
    }
  } catch (err) {
    console.warn(
      '[buildContext] Failed to load services:',
      err instanceof Error ? err.message : err,
    );
  }

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
          const evidencePath = join(relBase, 'evidence.ndjson');
          const evidenceIds = new Set<string>();
          try {
            const content = store.readText(evidencePath).trim();
            if (content) {
              const parsed = NdJson.parse(content);
              for (const row of parsed) {
                const idParsed = z.object({ id: z.string() }).safeParse(row);
                if (idParsed.success) evidenceIds.add(idParsed.data.id);
                else
                  console.warn(
                    `[buildContext] Skipping invalid evidence row in ${evidencePath}:`,
                    idParsed.error?.message ?? idParsed.error,
                  );
              }
            }
          } catch (err) {
            console.warn(
              `[buildContext] Failed to read evidence: ${evidencePath}`,
              err instanceof Error ? err.message : err,
            );
          }
          ctx.evidenceIdsByIssue.set(relBase, evidenceIds);
        }
      }
    }
  } catch (err) {
    console.warn(
      '[buildContext] Failed to load issues/evidence:',
      err instanceof Error ? err.message : err,
    );
  }

  return ctx;
}
