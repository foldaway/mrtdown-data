export const entityCollections = [
  'station',
  'line',
  'service',
  'operator',
  'town',
  'landmark',
] as const;

export type EntityCollection = (typeof entityCollections)[number];

export const entityCollectionDirectories: Record<EntityCollection, string> = {
  landmark: 'landmark',
  line: 'line',
  operator: 'operator',
  service: 'service',
  station: 'station',
  town: 'town',
};

export const issueDirectory = 'issue';
export const issueFileName = 'issue.json';
export const evidenceFileName = 'evidence.ndjson';
export const impactFileName = 'impact.ndjson';
