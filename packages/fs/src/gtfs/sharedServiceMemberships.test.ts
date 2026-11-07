import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScheduledTripPatternSchema } from '@mrtdown/core';
import { afterEach, describe, expect, it } from 'vitest';
import { artifactFixture } from './__tests__/artifactFixture.js';
import { sourceReview } from './__tests__/timetableStoreFixture.js';
import { createScheduledTripAssignmentProposals } from './assignmentProposals.js';
import { hashBytes } from './capture.js';
import { groupedScopedReviewDraftSha256 } from './groupedReviewContract.js';
import { queryRetainedScheduledDepartures } from './retainedDepartures.js';
import { readSchedule } from './schedule.js';
import {
  validateScheduledTripPatternDateScope,
  validateScheduledTripPatternReferences,
} from './scheduledTripPattern.js';
import { createGroupedScopedReconciliationDraft } from './scopedReviewDraft.js';
import { applyScheduledSharedServiceMemberships } from './sharedServiceMemberships.js';
import { importScheduledTimetableArtifact } from './timetableStore.js';
import { readScheduleTopology } from './topology.js';
import { prepareVerifiedGtfsTimetableArtifact } from './verifiedTimetableArtifact.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'shared-memberships-'));
  roots.push(root);
  const { options } = await artifactFixture(root, true);
  const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
  const service = await json(join(root, 'data/service/SVC.json'));
  await writeFile(
    join(root, 'data/service/OTHER.json'),
    JSON.stringify({ ...service, id: 'OTHER' }),
  );
  const linePath = join(root, 'data/line/NSL.json');
  const line = await json(linePath);
  line.serviceIds.push('OTHER');
  await writeFile(linePath, JSON.stringify(line));
  const topology = await readScheduleTopology(options.dataDir);
  const { tables, manifest } = readSchedule(
    await readFile(join(root, 'schedule.zip')),
  );
  const identity = {
    sourceManifest: manifest,
    canonicalCommit: options.canonicalCommit,
    topology: {
      projectionVersion: 1,
      sha256: hashBytes(Buffer.from(JSON.stringify(topology))),
    },
  };
  const context = { tables, topology, identity };
  const draft = createGroupedScopedReconciliationDraft(context, {
    pilotLineIds: ['NSL'],
    preparedBy: 'Synthetic shared-service test',
  });
  const pattern = draft.decisions.find(
    (decision) => decision.kind === 'pattern',
  );
  if (!pattern) throw new Error('Missing synthetic pattern');
  const claims = {
    schemaVersion: 1,
    documentKind: 'gtfs-shared-service-membership-claims',
    baseDraftSha256: groupedScopedReviewDraftSha256(draft),
    claims: [
      {
        providerPatternId: pattern.providerId,
        serviceDates: ['2026-01-01', '2026-01-02'],
        reason: 'Synthetic explicit decision: both service memberships apply.',
        target: {
          kind: 'sharedServiceRevisions',
          members: ['SVC', 'OTHER'].map((id) => ({
            kind: 'serviceRevision',
            id,
            revisionId: 'r1',
            match: 'exact',
          })),
        },
      },
    ],
  };
  return { root, options, context, draft, claims };
}

describe('shared scheduled service memberships', () => {
  it('preserves source/date accounting and requires exact claims without inventing approval', async () => {
    const f = await fixture();
    f.claims.claims[0].serviceDates = ['2026-01-01'];
    const before = structuredClone({
      draft: f.draft,
      claims: f.claims,
      context: f.context,
    });
    const draft = applyScheduledSharedServiceMemberships(
      f.context,
      f.draft,
      f.claims,
    );
    const proposals = createScheduledTripAssignmentProposals(f.context, draft);
    expect(proposals.review).toMatchObject({
      valid: true,
      coverageComplete: true,
      matchedPatternDates: 1,
      unresolvedPatternDates: 1,
      excludedPatternDates: 0,
      approvalMatches: false,
      generationEligible: false,
    });
    expect(proposals.document.assignments).toHaveLength(1);
    const pattern = proposals.document.assignments[0].scope.binding.pattern;
    expect(pattern).not.toHaveProperty('serviceId');
    expect(pattern.serviceMemberships).toEqual([
      { serviceId: 'OTHER', revisionId: 'r1' },
      { serviceId: 'SVC', revisionId: 'r1' },
    ]);
    expect(pattern.stops[0].platformIds).toEqual(['A', 'C']);
    expect({ draft: f.draft, claims: f.claims, context: f.context }).toEqual(
      before,
    );
    expect(() =>
      applyScheduledSharedServiceMemberships(f.context, draft, f.claims),
    ).toThrow('base mapping draft');
    const duplicate = structuredClone(f.claims);
    duplicate.claims.push(duplicate.claims[0]);
    expect(() =>
      applyScheduledSharedServiceMemberships(f.context, f.draft, duplicate),
    ).toThrow('Overlapping');
    const outside = structuredClone(f.claims);
    outside.claims[0].serviceDates = ['2026-01-03'];
    expect(() =>
      applyScheduledSharedServiceMemberships(f.context, f.draft, outside),
    ).toThrow('unknown or uncovered');
  });

  it('queries either or both services as one after-midnight boarding departure through verified storage', async () => {
    const f = await fixture();
    const draft = applyScheduledSharedServiceMemberships(
      f.context,
      f.draft,
      f.claims,
    );
    const artifact = await prepareVerifiedGtfsTimetableArtifact(
      join(f.root, 'schedule.zip'),
      join(f.root, 'capture.json'),
      { ...f.options, draft },
    );
    const settings = {
      storeDir: join(f.root, 'store'),
      dataDir: f.options.dataDir,
      importInstant: '2026-01-20T00:00:00Z',
    };
    await mkdir(settings.storeDir);
    await importScheduledTimetableArtifact(artifact, artifact.manifestSha256, {
      ...settings,
      sourceReview: sourceReview('baseline', artifact),
    });
    const query = (
      services: { serviceId: string } | { serviceIds: string[] },
    ) =>
      queryRetainedScheduledDepartures({
        ...settings,
        startInstant: '2026-01-02T00:30:00+08:00',
        endInstant: '2026-01-02T01:30:00+08:00',
        scope: {
          stationId: 'S',
          lineId: 'NSL',
          destinationStationId: 'D',
          platformId: 'C',
          ...services,
        },
      });
    const a = await query({ serviceId: 'SVC' }),
      b = await query({ serviceId: 'OTHER' }),
      both = await query({ serviceIds: ['SVC', 'OTHER'] });
    expect(a.complete && b.complete && both.complete).toBe(true);
    expect(a.departures).toEqual(b.departures);
    expect(both.departures).toEqual(a.departures);
    expect(both.departures).toHaveLength(1);
    expect(both.departures[0]).toMatchObject({
      providerTripId: '0009007199254740993',
      stopSequence: '09007199254740992',
      serviceDate: '2026-01-01',
      departureInstant: '2026-01-01T17:00:00Z',
      serviceMemberships: [
        { serviceId: 'OTHER', revisionId: 'r1' },
        { serviceId: 'SVC', revisionId: 'r1' },
      ],
    });
    expect(artifact.coverage).toMatchObject({ assignedTripDateCount: 2 });
    const single = structuredClone(f.draft);
    for (const decision of single.decisions)
      if (decision.kind === 'pattern') {
        decision.disposition = 'matched';
        decision.target = {
          kind: 'serviceRevision',
          id: 'SVC',
          revisionId: 'r1',
          match: 'exact',
        };
      }
    const singleArtifact = await prepareVerifiedGtfsTimetableArtifact(
      join(f.root, 'schedule.zip'),
      join(f.root, 'capture.json'),
      { ...f.options, draft: single },
    );
    const singleStore = join(f.root, 'single-store');
    await mkdir(singleStore);
    await importScheduledTimetableArtifact(
      singleArtifact,
      singleArtifact.manifestSha256,
      {
        ...settings,
        storeDir: singleStore,
        sourceReview: sourceReview('baseline', singleArtifact),
      },
    );
    const partial = await queryRetainedScheduledDepartures({
      ...settings,
      storeDir: singleStore,
      startInstant: '2026-01-02T00:30:00+08:00',
      endInstant: '2026-01-02T01:30:00+08:00',
      scope: {
        stationId: 'S',
        lineId: 'NSL',
        destinationStationId: 'D',
        serviceIds: ['SVC', 'OTHER'],
      },
    });
    expect(partial.complete).toBe(false);
    expect(partial.departures).toEqual([]);
    expect(
      partial.serviceDays.every((day) =>
        day.attempts.some((attempt) => attempt.reason === 'scope-not-covered'),
      ),
    ).toBe(true);
  });

  it('rejects unknown, inactive, reordered, code-inconsistent or restricted member services', async () => {
    const f = await fixture();
    const draft = applyScheduledSharedServiceMemberships(
      f.context,
      f.draft,
      f.claims,
    );
    const assignment = createScheduledTripAssignmentProposals(f.context, draft)
      .document.assignments[0];
    const scope = assignment.scope;
    for (const change of [
      'unknown',
      'inactive',
      'path',
      'code',
      'platform',
    ] as const) {
      const topology = structuredClone(f.context.topology);
      const other = topology.services.find((service) => service.id === 'OTHER');
      if (!other) throw new Error('Missing synthetic service');
      if (change === 'unknown') other.id = 'MISSING';
      if (change === 'inactive') other.revisions[0].startAt = '2026-01-02';
      if (change === 'path') other.revisions[0].stations.reverse();
      if (change === 'code')
        other.revisions[0].stations[0].displayCode = 'NS999';
      if (change === 'platform')
        topology.stations[0].platforms[0].serviceIds = ['SVC'];
      expect(
        () => validateScheduledTripPatternDateScope(scope, topology),
        change,
      ).toThrow();
    }
    const duplicate = {
      ...scope.binding.pattern,
      serviceMemberships: [
        { serviceId: 'SVC', revisionId: 'r1' },
        { serviceId: 'SVC', revisionId: 'r2' },
      ],
    };
    expect(ScheduledTripPatternSchema.safeParse(duplicate).success).toBe(false);
    expect(
      ScheduledTripPatternSchema.safeParse({
        ...scope.binding.pattern,
        serviceId: 'SVC',
        revisionId: 'r1',
      }).success,
    ).toBe(false);
    expect(() =>
      validateScheduledTripPatternReferences(
        scope.binding.pattern,
        f.context.topology,
      ),
    ).not.toThrow();
  });

  it('rejects incomplete candidate sets and never uses platform preference to narrow them', async () => {
    const f = await fixture();
    const third = structuredClone(f.context.topology.services[0]);
    third.id = 'THIRD';
    f.context.topology.services.push(third);
    f.context.topology.lines[0].serviceIds.push('THIRD');
    f.context.identity.topology.sha256 = hashBytes(
      Buffer.from(JSON.stringify(f.context.topology)),
    );
    f.draft = createGroupedScopedReconciliationDraft(f.context, {
      pilotLineIds: ['NSL'],
      preparedBy: 'Synthetic three-candidate test',
    });
    f.claims.baseDraftSha256 = groupedScopedReviewDraftSha256(f.draft);
    expect(() =>
      applyScheduledSharedServiceMemberships(f.context, f.draft, f.claims),
    ).toThrow('every dated candidate');
    f.claims.claims[0].target.members.push({
      kind: 'serviceRevision',
      id: 'THIRD',
      revisionId: 'r1',
      match: 'exact',
    });
    f.context.topology.stations[0].platforms[0].serviceIds = ['SVC', 'OTHER'];
    f.context.identity.topology.sha256 = hashBytes(
      Buffer.from(JSON.stringify(f.context.topology)),
    );
    f.draft = createGroupedScopedReconciliationDraft(f.context, {
      pilotLineIds: ['NSL'],
      preparedBy: 'Synthetic restricted member test',
    });
    f.claims.baseDraftSha256 = groupedScopedReviewDraftSha256(f.draft);
    expect(() =>
      applyScheduledSharedServiceMemberships(f.context, f.draft, f.claims),
    ).toThrow('platform diagnostics');
  });
});
