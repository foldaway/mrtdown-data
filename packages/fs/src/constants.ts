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

export const DIR_ISSUE = issueDirectory;
export const DIR_LINE = entityCollectionDirectories.line;
export const DIR_LANDMARK = entityCollectionDirectories.landmark;
export const DIR_OPERATOR = entityCollectionDirectories.operator;
export const DIR_SERVICE = entityCollectionDirectories.service;
export const DIR_STATION = entityCollectionDirectories.station;
export const DIR_TOWN = entityCollectionDirectories.town;

export const FILE_ISSUE = issueFileName;
export const FILE_ISSUE_EVIDENCE = evidenceFileName;
export const FILE_ISSUE_IMPACT = impactFileName;
