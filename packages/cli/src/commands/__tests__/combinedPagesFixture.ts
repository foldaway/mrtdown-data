import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  createScheduledCombinedReview,
  createScheduledSourceJourneyMappingDraft,
  groupedScopedReviewDraftSha256,
  hashBytes,
  inspectCombinedTimetableRelease,
  readScheduleTopology,
} from '@mrtdown/fs';
import { zipSync } from 'fflate';
import { combinedArtifactFixture } from '../../../../fs/src/gtfs/__tests__/combinedArtifactFixture.js';
import { readSchedule } from '../../../../fs/src/gtfs/schedule.js';
import { gtfsLicenceReference } from '../../gtfsTerms.js';

export const combinedTermsText = 'Synthetic combined timetable terms';
export const combinedReleaseInstant = '2026-11-07T20:00:00Z';

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

/** Materialize a synthetic capture and reviews bound to the test canonical tree. */
export async function combinedPagesFixture(
  root: string,
  fixtureDataDir: string,
  { includeFeedInfo = true } = {},
) {
  const { inputs, capture } = combinedArtifactFixture();
  const dataDir = join(root, 'data');
  await cp(join(fixtureDataDir, 'rights'), join(dataDir, 'rights'), {
    recursive: true,
  });
  const name = { 'en-SG': 'Synthetic', 'zh-Hans': null, ms: null, ta: null };
  const { topology } = inputs.context;
  const hours = { start: '05:00', end: '02:00' };
  const records = {
    operator: topology.operators.map((operator) => ({
      ...operator,
      name,
      foundedAt: '2000-01-01',
      url: null,
    })),
    line: topology.lines.map((line) => ({
      ...line,
      name,
      type: 'mrt.high',
      color: '#000000',
      startedAt: '2000-01-01',
      platformDoorCount: 24,
      trainCarCounts: [6],
    })),
    service: topology.services.map((service) => ({
      ...service,
      name,
      revisions: service.revisions.map(({ stations, ...revision }) => ({
        ...revision,
        path: { stations },
        operatingHours: { weekdays: hours, weekends: hours },
      })),
    })),
    station: topology.stations.map(
      ({ platforms, stationCodes, ...station }, index) => ({
        ...station,
        name,
        geo: { latitude: 1, longitude: 103 + index / 100 },
        landmarkIds: [],
        townId: 'town',
        stationCodes: stationCodes.map((code) => ({
          ...code,
          structureType: 'underground',
        })),
        layout: {
          platforms: platforms.map(
            ({ serviceIds, boardingStatus, ...platform }) => ({
              ...platform,
              lastUpdated: '2026-11-01',
              serviceIds: serviceIds.length ? serviceIds : undefined,
              boardingStatus: boardingStatus ?? undefined,
            }),
          ),
        },
      }),
    ),
    town: [{ id: 'town', name }],
    'public-holiday': [inputs.holidayCalendar],
  };
  for (const [kind, entities] of Object.entries(records)) {
    for (const entity of entities) {
      await writeJson(join(dataDir, kind, `${entity.id}.json`), entity);
    }
  }

  const sourceTables = inputs.context.tables;
  if (includeFeedInfo) {
    sourceTables['feed_info.txt'] = [
      {
        feed_publisher_name: 'Synthetic',
        feed_publisher_url: 'https://example.test/',
        feed_lang: 'en',
        feed_start_date: '20260101',
        feed_end_date: '20261231',
        feed_version: 'synthetic',
      },
    ];
  }
  for (const row of sourceTables['agency.txt']) {
    row.agency_name = 'Synthetic';
    row.agency_url = 'https://example.test/';
  }
  for (const row of sourceTables['stops.txt']) row.stop_name = row.stop_id;
  const zipBytes = zipSync(
    Object.fromEntries(
      Object.entries(sourceTables).map(([file, rows]) => {
        const columns = [...new Set(rows.flatMap(Object.keys))];
        const csv = [
          columns.join(','),
          ...rows.map((row) => columns.map((key) => row[key] ?? '').join(',')),
        ];
        return [file, Buffer.from(csv.join('\n'))];
      }),
    ),
    { mtime: new Date('2000-01-01T00:00:00Z') },
  );
  const { tables, manifest: sourceManifest } = readSchedule(zipBytes);
  Object.assign(capture, {
    sha256: hashBytes(zipBytes),
    byte_length: zipBytes.length,
    attribution: 'Synthetic <script>attribution</script>',
    rights_status: 'redistribution_permitted',
  });
  const stagedTopology = await readScheduleTopology(dataDir);
  const context = {
    tables,
    topology: stagedTopology,
    identity: {
      ...inputs.context.identity,
      sourceManifest,
      topology: {
        projectionVersion: stagedTopology.projectionVersion,
        sha256: hashBytes(Buffer.from(JSON.stringify(stagedTopology))),
      },
    },
  };
  const sourceJourneyPolicy = { ...inputs.sourceJourneyPolicy, sourceManifest };
  const allocationPolicy = { ...inputs.allocationPolicy, sourceManifest };
  const holidayPolicy = { ...inputs.holidayPolicy, sourceManifest };
  const sourceJourney = createScheduledSourceJourneyMappingDraft(
    context,
    sourceJourneyPolicy,
    allocationPolicy,
    holidayPolicy,
    inputs.holidayCalendar,
  );
  const binding = { sourceManifest, captureSha256: capture.sha256 };
  const policies = {
    applicabilityPolicy: {
      ...inputs.applicabilityPolicy,
      ...binding,
      captureServiceDate: '2026-11-03',
    },
    associationPolicy: { ...inputs.associationPolicy, ...binding },
    sourceJourneyPolicy,
    allocationPolicy,
    holidayPolicy,
    sharedServiceMemberships: {
      ...inputs.sharedServiceMemberships,
      baseDraftSha256: groupedScopedReviewDraftSha256(
        sourceJourney.mapping.mapping,
      ),
    },
  };
  const boundInputs = {
    ...policies,
    context,
    captureSha256: capture.sha256,
    captureRetrievedAt: capture.retrieved_at,
    holidayCalendar: inputs.holidayCalendar,
  };
  const draft = createScheduledCombinedReview(boundInputs);
  const mappingApproval = {
    schemaVersion: 1,
    documentKind: 'gtfs-combined-mapping-approval',
    identity: draft.identity,
    draftSha256: draft.draftSha256,
    reviewer: 'Synthetic mapping reviewer',
    reason: 'Synthetic fixture approval',
  };
  const sha256 = hashBytes(Buffer.from(combinedTermsText));
  const terms = {
    licence: { reference: gtfsLicenceReference, sha256 },
    apiTerms: {
      reference:
        'https://datamall.lta.gov.sg/content/datamall/en/api-terms-of-service.html',
      sha256,
    },
  };
  const candidate = inspectCombinedTimetableRelease(
    boundInputs,
    draft,
    capture,
    {
      correctionRevision: 1,
      currentLicenceReference: gtfsLicenceReference,
      releaseInstant: combinedReleaseInstant,
      currentTerms: terms,
      mappingApproval,
    },
  );
  const releaseReview = {
    schemaVersion: 1,
    documentKind: 'gtfs-timetable-release-review',
    manifestSha256: candidate.manifestSha256,
    mappingApprovalSha256: candidate.manifest.mappingApprovalSha256,
    reviewer: 'Synthetic release reviewer',
    reviewedAt: '2026-11-06T20:00:00Z',
    decision: 'release-permitted',
    terms,
    licenceVersion: 'synthetic-v1',
    obligations: 'Synthetic attribution',
    captureConditions: 'Synthetic acquisition conditions',
    effectiveAt: null,
  };

  const reviewRecords = { ...policies, draft, mappingApproval, releaseReview };
  for (const [key, value] of Object.entries(reviewRecords)) {
    await writeJson(join(root, `${key}.json`), value);
  }
  const config = {
    schemaVersion: 1,
    canonicalCommit: context.identity.canonicalCommit,
    correctionRevision: 1,
    holidayCalendarId: inputs.holidayCalendar.id,
    ...Object.fromEntries(
      Object.keys(reviewRecords).map((key) => [key, `${key}.json`]),
    ),
  };
  const options = {
    dataDir,
    outDir: join(root, 'pages'),
    gtfsFile: join(root, 'schedule.zip'),
    gtfsCapture: join(root, 'capture.json'),
    gtfsCombinedConfig: join(root, 'config.json'),
  };
  await writeFile(options.gtfsFile, zipBytes);
  await writeJson(options.gtfsCapture, capture);
  await writeJson(options.gtfsCombinedConfig, config);
  await writeJson(join(dataDir, 'combined-timetable', 'unreviewed.json'), {});
  await writeJson(join(dataDir, 'combined-timetable-release-index.json'), {});
  return {
    options,
    config,
    topology: stagedTopology,
    manifestSha256: candidate.manifestSha256,
  };
}
