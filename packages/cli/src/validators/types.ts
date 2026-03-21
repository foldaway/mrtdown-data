export interface ValidationError {
  file: string;
  line?: number;
  message: string;
}

/**
 * Set of entity IDs loaded from data. Used for relationship validation.
 * When omitted, validators run schema validation only (no relationship checks).
 */
export interface ValidationContext {
  townIds: Set<string>;
  landmarkIds: Set<string>;
  operatorIds: Set<string>;
  lineIds: Set<string>;
  serviceIds: Set<string>;
  stationIds: Set<string>;
  /** evidence IDs per issue path (e.g. "issue/2025/03/2025-03-11-x") */
  evidenceIdsByIssue: Map<string, Set<string>>;
}
