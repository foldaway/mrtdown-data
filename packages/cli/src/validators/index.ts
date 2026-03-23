import type { IStore } from '@mrtdown/fs';
import { buildContext } from './buildContext.js';
import { validateIssues } from './issue.js';
import { validateLandmarks } from './landmark.js';
import { validateLines, validateLinesRelationships } from './line.js';
import { validateOperators } from './operator.js';
import { validateServices, validateServicesRelationships } from './service.js';
import { validateStations, validateStationsRelationships } from './station.js';
import { validateTowns } from './town.js';
import type { ValidationError } from './types.js';

export type ValidationScope =
  | 'town'
  | 'landmark'
  | 'operator'
  | 'station'
  | 'line'
  | 'service'
  | 'issue';

export interface ValidateOptions {
  /** When set, only run validators for these entity types. */
  scope?: ValidationScope[];
}

const SCOPE_NEEDS_CONTEXT: ValidationScope[] = [
  'station',
  'line',
  'service',
  'issue',
];

function inScope(
  scope: Set<ValidationScope> | null,
  type: ValidationScope,
): boolean {
  return !scope || scope.has(type);
}

export function validateAll(
  store: IStore,
  options?: ValidateOptions,
): ValidationError[] {
  const scope = options?.scope;
  const scopeSet = scope && scope.length > 0 ? new Set(scope) : null;
  const needsContext =
    !scopeSet || SCOPE_NEEDS_CONTEXT.some((t) => scopeSet.has(t));
  const ctx = needsContext ? buildContext(store) : null;

  const allErrors: ValidationError[] = [];

  if (inScope(scopeSet, 'town')) allErrors.push(...validateTowns(store));
  if (inScope(scopeSet, 'landmark'))
    allErrors.push(...validateLandmarks(store));
  if (inScope(scopeSet, 'operator'))
    allErrors.push(...validateOperators(store));
  if (inScope(scopeSet, 'line')) {
    allErrors.push(...validateLines(store));
    if (ctx) allErrors.push(...validateLinesRelationships(store, ctx));
  }
  if (inScope(scopeSet, 'station')) {
    allErrors.push(...validateStations(store));
    if (ctx) allErrors.push(...validateStationsRelationships(store, ctx));
  }
  if (inScope(scopeSet, 'service')) {
    allErrors.push(...validateServices(store));
    if (ctx) allErrors.push(...validateServicesRelationships(store, ctx));
  }
  if (inScope(scopeSet, 'issue') && ctx) {
    allErrors.push(...validateIssues(store, ctx));
  }

  return allErrors;
}

export { buildContext } from './buildContext.js';
export { validateIssue, validateIssues } from './issue.js';
export { validateLandmarks } from './landmark.js';
export {
  validateLines,
  validateLinesRelationships,
} from './line.js';
export { validateOperators } from './operator.js';
export {
  validateServices,
  validateServicesRelationships,
} from './service.js';
export {
  validateStations,
  validateStationsRelationships,
} from './station.js';
export { validateTowns } from './town.js';
export type { ValidationContext, ValidationError } from './types.js';
