import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { combinedArtifactFixture } from '../packages/fs/src/gtfs/__tests__/combinedArtifactFixture.js';
import { hashBytes } from '../packages/fs/src/gtfs/capture.js';
import { inspectCombinedTimetableRelease } from '../packages/fs/src/gtfs/combinedTimetableRelease.js';
import { groupedScopedReviewDraftSha256 } from '../packages/fs/src/gtfs/groupedReviewContract.js';
import { createScheduledCombinedReview } from '../packages/fs/src/gtfs/scheduledCombinedReview.js';
import { createScheduledSourceJourneyMappingDraft } from '../packages/fs/src/gtfs/scheduledSourceJourneys.js';
import { assessAutomaticUpdate } from './gtfs-automatic-eligibility.mjs';
import {
  checkAutomaticDailyChanges,
  planAutomaticMappings,
} from './gtfs-automatic-mapping.mjs';
import {
  prepareAutomaticRelease,
  renderAutomaticPublicationReport,
} from './prepare-gtfs-automatic-release.mjs';

const extendedPolicy = JSON.parse(
  readFileSync(
    new URL(
      '../docs/gtfs/operations/automatic-publication-policy.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const policy = {
  ...extendedPolicy,
  revision: 'timing-only-v1',
  scope: 'timing-only',
};

function fixture(
  feedVersion: string | null = '0.1',
  extendPath = false,
  staggerAccess = false,
) {
  const { inputs, capture: receipt } = combinedArtifactFixture();
  if (staggerAccess) {
    for (const row of inputs.context.tables['stop_times.txt'].filter(
      (row) => row.trip_id === 'SHARED_NO_PICKUP',
    )) {
      row.arrival_time = row.arrival_time.replace('25:0', '25:1');
      row.departure_time = row.departure_time.replace('25:0', '25:1');
    }
    const grouped = createScheduledSourceJourneyMappingDraft(
      inputs.context,
      inputs.sourceJourneyPolicy,
      inputs.allocationPolicy,
      inputs.holidayPolicy,
      inputs.holidayCalendar,
    );
    inputs.sharedServiceMemberships.baseDraftSha256 =
      groupedScopedReviewDraftSha256(grouped.mapping.mapping);
  }
  if (extendPath) {
    inputs.context.tables['trips.txt'] = inputs.context.tables[
      'trips.txt'
    ].filter((trip) => trip.trip_id !== 'SHARED_NO_PICKUP');
    inputs.context.tables['stop_times.txt'] = inputs.context.tables[
      'stop_times.txt'
    ].filter((row) => row.trip_id !== 'SHARED_NO_PICKUP');
    const service = inputs.context.topology.services.find(
      (service) => service.id === 'SVC',
    );
    const station = inputs.context.topology.stations.find(
      (station) => station.id === 'T',
    );
    if (!service || !station) throw new Error('Missing fixture topology');
    service.revisions[0].stations.push({ stationId: 'T', displayCode: 'NE4' });
    station.platforms[0].serviceIds.push('SVC');
    for (const trip of [...inputs.context.tables['trips.txt']]) {
      const rows = inputs.context.tables['stop_times.txt'].filter(
        (row) => row.trip_id === trip.trip_id,
      );
      for (let i = 1; i < 20; i++) {
        const tripId = `${trip.trip_id}-${i}`;
        inputs.context.tables['trips.txt'].push({ ...trip, trip_id: tripId });
        inputs.context.tables['stop_times.txt'].push(
          ...rows.map((row) => ({ ...row, trip_id: tripId })),
        );
      }
    }
    inputs.context.identity.topology.sha256 = hashBytes(
      Buffer.from(JSON.stringify(inputs.context.topology)),
    );
    const grouped = createScheduledSourceJourneyMappingDraft(
      inputs.context,
      inputs.sourceJourneyPolicy,
      inputs.allocationPolicy,
      inputs.holidayPolicy,
      inputs.holidayCalendar,
    );
    inputs.sharedServiceMemberships.baseDraftSha256 =
      groupedScopedReviewDraftSha256(grouped.mapping.mapping);
  }
  inputs.context.tables['feed_info.txt'] = [
    {
      feed_publisher_name: 'Synthetic fixture',
      feed_publisher_url: 'https://example.com',
      feed_lang: 'en',
      feed_start_date: '20260101',
      feed_end_date: '20261231',
      ...(feedVersion === null ? {} : { feed_version: feedVersion }),
    },
  ];
  receipt.licence_reference =
    'https://datamall.lta.gov.sg/content/datamall/en/SingaporeOpenDataLicence.html';
  const previousCapture = {
    ...receipt,
    rights_status: 'redistribution_permitted' as const,
  };
  const draft = createScheduledCombinedReview(inputs);
  const currentTerms = {
    licence: { reference: receipt.licence_reference, sha256: 'a'.repeat(64) },
    apiTerms: {
      reference:
        'https://datamall.lta.gov.sg/content/datamall/en/api-terms-of-service.html',
      sha256: 'b'.repeat(64),
    },
  };
  const mappingApproval = {
    schemaVersion: 1,
    documentKind: 'gtfs-combined-mapping-approval',
    identity: draft.identity,
    draftSha256: draft.draftSha256,
    reviewer: 'Fixture reviewer',
    reason: 'Approved fixture',
  };
  const options = {
    correctionRevision: 1,
    currentLicenceReference: receipt.licence_reference,
    currentTerms,
    releaseInstant: '2026-11-07T20:00:00Z',
    mappingApproval,
  };
  const manifest = inspectCombinedTimetableRelease(
    inputs,
    draft,
    previousCapture,
    options,
  ).manifest;
  const initial = inspectCombinedTimetableRelease(
    inputs,
    draft,
    previousCapture,
    options,
  );
  const releaseReview = {
    schemaVersion: 1,
    documentKind: 'gtfs-timetable-release-review',
    manifestSha256: initial.manifestSha256,
    mappingApprovalSha256: manifest.mappingApprovalSha256,
    reviewer: 'Fixture reviewer',
    reviewedAt: options.releaseInstant,
    decision: 'release-permitted',
    terms: currentTerms,
    licenceVersion: 'v1',
    obligations: 'Attribute fixture',
    captureConditions: 'No restriction',
    effectiveAt: null,
  };
  const baseline = inspectCombinedTimetableRelease(
    inputs,
    draft,
    previousCapture,
    { ...options, releaseReview },
  );
  if (!baseline.bundle) throw new Error(baseline.release.blockers.join('; '));
  const tables = structuredClone(inputs.context.tables);
  for (const row of tables['stop_times.txt']) {
    for (const field of ['arrival_time', 'departure_time'])
      if (row[field]) row[field] = row[field].replace(/:00$/, ':10');
  }
  return {
    baselineInputs: inputs,
    previousCapture,
    baselineConfig: { correctionRevision: 1, draftSha256: draft.draftSha256 },
    baselineEvidence: JSON.parse(
      Buffer.from(baseline.bundle.files.releaseBytes).toString(),
    ),
    baselineIndex: baseline.bundle.index,
    tables,
    sourceManifest: {
      ...inputs.context.identity.sourceManifest,
      'stop_times.txt': 'c'.repeat(64),
    },
    capture: {
      ...previousCapture,
      sha256: 'e'.repeat(64),
      retrieved_at: '2026-11-08T00:00:00Z',
    },
    policy,
    currentTerms,
    now: '2026-11-08T01:00:00Z',
    runUrl: 'https://github.com/foldaway/mrtdown-data/actions/runs/123',
  };
}

function splitWeekdayCalendar(
  args: ReturnType<typeof fixture>,
  start = '20261202',
  end = '20261201',
) {
  const original = args.tables['calendar.txt'].find(
    (row) => row.service_id === 'WD',
  );
  if (!original) throw new Error('Missing weekday calendar');
  args.tables['calendar.txt'].push({
    ...original,
    service_id: 'WD_NEW',
    start_date: start,
  });
  original.end_date = end;
  for (const trip of args.tables['trips.txt'].filter(
    (trip) => trip.service_id === 'WD',
  )) {
    const tripId = `new-${trip.trip_id}`;
    args.tables['trips.txt'].push({
      ...trip,
      trip_id: tripId,
      service_id: 'WD_NEW',
    });
    args.tables['stop_times.txt'].push(
      ...args.tables['stop_times.txt']
        .filter((row) => row.trip_id === trip.trip_id)
        .map((row) => ({ ...row, trip_id: tripId })),
    );
  }
}

describe('automatic GTFS publication', () => {
  it('holds source successors that carry an explicit single-service selection', () => {
    const args = fixture();
    args.baselineInputs.sharedServiceMemberships.serviceSelections = [
      {
        providerPatternId:
          args.baselineInputs.sharedServiceMemberships.claims[0]
            .providerPatternId,
        serviceDates: ['2026-01-01'],
        target: {
          kind: 'serviceRevision',
          id: 'SVC',
          revisionId: 'R',
          match: 'exact',
        },
        reason: 'Reviewed single-service selection',
      },
    ];
    expect(() =>
      planAutomaticMappings(
        args.baselineInputs,
        structuredClone(args.baselineInputs),
        'Synthetic successor',
        (condition, reason) => {
          if (!condition) throw new Error(reason);
        },
      ),
    ).toThrow(
      'Explicit single-service selections require a new mapping review',
    );
  });

  it('handles a future weekday split without approving or checking timings outside the existing window', () => {
    const args = fixture();
    args.policy = extendedPolicy;
    splitWeekdayCalendar(args);
    for (const row of args.tables['stop_times.txt'].filter((row) =>
      row.trip_id.startsWith('new-'),
    )) {
      row.arrival_time = row.arrival_time.replace(/^25:/, '27:');
      row.departure_time = row.departure_time.replace(/^25:/, '27:');
    }
    const result = prepareAutomaticRelease(args);
    expect(result.decision).toBe('ready');
    expect(result.inputs.holidayPolicy).toMatchObject({
      schemaVersion: 3,
      families: [
        expect.objectContaining({
          weekdayCalendarId: 'WD',
          additionalWeekdayCalendarIds: ['WD_NEW'],
        }),
      ],
    });
    expect(result.inputs.applicabilityPolicy.serviceDateRange).toEqual(
      args.baselineInputs.applicabilityPolicy.serviceDateRange,
    );
    expect(
      JSON.parse(Buffer.from(result.bundle.files.manifestBytes).toString())
        .serviceDateRange.endDateExclusive,
    ).toBe('2026-12-01');
    expect(
      result.draft.associationReview.patterns
        .flatMap((pattern) => pattern.supportedServiceDates)
        .every((date) => date < '2026-12-01'),
    ).toBe(true);
    expect(result.coverage.unassignedTripDateCount).toBe(0);
    expect(() =>
      prepareAutomaticRelease({
        ...args,
        policy: { ...extendedPolicy, revision: 'canonical-schedule-v2' },
      }),
    ).toThrow(/unique successor/);
  });

  it('reconstructs a segmented predecessor for another checked successor', () => {
    const args = fixture();
    args.policy = extendedPolicy;
    const unsplit = structuredClone(args.tables);
    splitWeekdayCalendar(args, '20261110', '20261109');
    const first = prepareAutomaticRelease(args);
    const nextTables = structuredClone(args.tables);
    for (const tables of [nextTables, unsplit])
      for (const row of tables['stop_times.txt'])
        for (const field of ['arrival_time', 'departure_time'])
          row[field] = row[field].replace(/:10$/, ':20');
    const successor = {
      ...args,
      tables: nextTables,
      baselineInputs: first.inputs,
      baselineConfig: {
        correctionRevision: 1,
        draftSha256: first.draft.draftSha256,
      },
      baselineEvidence: JSON.parse(
        Buffer.from(first.bundle.files.releaseBytes).toString(),
      ),
      baselineIndex: first.bundle.index,
      previousCapture: args.capture,
      capture: {
        ...args.capture,
        sha256: 'f'.repeat(64),
        retrieved_at: '2026-11-08T02:00:00Z',
      },
      now: '2026-11-08T03:00:00Z',
    };
    const second = prepareAutomaticRelease(successor);
    expect(second.decision).toBe('ready');
    expect(second.inputs.holidayPolicy.schemaVersion).toBe(3);
    expect(second.coverage.unassignedTripDateCount).toBe(0);
    const merged = prepareAutomaticRelease({
      ...successor,
      tables: unsplit,
    });
    expect(merged.decision).toBe('ready');
    expect(merged.inputs.holidayPolicy.schemaVersion).toBe(2);
    expect(
      merged.inputs.holidayPolicy.families[0].additionalWeekdayCalendarIds,
    ).toBeUndefined();
  });

  it.each([
    ['20261203', '20261201'],
    ['20261201', '20261201'],
    ['20261109', '20261106'],
  ])('holds a calendar partition with a gap or overlap (%s, %s)', (start, end) => {
    const args = fixture();
    args.policy = extendedPolicy;
    splitWeekdayCalendar(args, start, end);
    expect(() => prepareAutomaticRelease(args)).toThrow(/gap|overlap/);
  });

  it('still holds timing changes inside the approved window after a calendar split', () => {
    const args = fixture();
    args.policy = extendedPolicy;
    splitWeekdayCalendar(args, '20261110', '20261109');
    for (const row of args.tables['stop_times.txt'].filter((row) =>
      row.trip_id.startsWith('new-'),
    )) {
      row.arrival_time = row.arrival_time.replace(/^25:/, '27:');
      row.departure_time = row.departure_time.replace(/^25:/, '27:');
    }
    expect(() => prepareAutomaticRelease(args)).toThrow(
      /distinct timing counterparts/,
    );
  });

  it('preserves historical daily guards when a capture combines past cleanup and a future split', () => {
    const args = fixture();
    args.policy = extendedPolicy;
    splitWeekdayCalendar(args);
    args.tables['calendar_dates.txt'] = [
      { service_id: 'WD', date: '20261106', exception_type: '2' },
    ];
    expect(() => prepareAutomaticRelease(args)).toThrow(
      /entire supported service date/,
    );
  });

  it('retains the exact published release for completed cleanup plus changes only outside its approval window', () => {
    const args = fixture();
    args.policy = extendedPolicy;
    args.tables = structuredClone(args.baselineInputs.context.tables);
    splitWeekdayCalendar(args);
    args.tables['calendar_dates.txt'] = [
      { service_id: 'WD', date: '20261106', exception_type: '2' },
    ];
    for (const row of args.tables['stop_times.txt'].filter((row) =>
      row.trip_id.startsWith('new-'),
    )) {
      row.arrival_time = row.arrival_time.replace(/^25:/, '27:');
      row.departure_time = row.departure_time.replace(/^25:/, '27:');
    }
    const original = structuredClone(args.baselineInputs);
    const result = prepareAutomaticRelease(args);
    expect(result.decision).toBe('no-op');
    expect(result.retainedManifestSha256).toBe(
      args.baselineIndex.manifestSha256,
    );
    expect(result.retainedTimetableProof).toMatchObject({
      expiredServiceDates: ['2026-11-06'],
      baselineCaptureSha256: args.previousCapture.sha256,
      candidateCaptureSha256: args.capture.sha256,
      serviceDateRange:
        args.baselineInputs.applicabilityPolicy.serviceDateRange,
      policyRevision: 'canonical-schedule-v3',
    });
    expect(
      result.retainedTimetableProof.outsideApprovedServiceDates,
    ).toHaveLength(22);
    expect(result.retainedTimetableProof.outsideApprovedServiceDates[0]).toBe(
      '2026-12-02',
    );
    expect(result.bundle).toBeUndefined();
    expect(result.mappingApproval).toBeUndefined();
    expect(result.releaseReview).toBeUndefined();
    expect(result.sourceReview).toBeUndefined();
    const report = renderAutomaticPublicationReport(result);
    expect(report).toContain('Decision: **no-op**');
    expect(report).toContain(args.baselineIndex.manifestSha256);
    expect(report).toContain(args.capture.sha256);
    expect(report).toContain('2026-11-06');
    expect(report).toContain('2026-12-02');
    expect(report).not.toContain('Zero unassigned');
    expect(args.baselineInputs).toEqual(original);
    args.currentTerms.licence.sha256 = 'f'.repeat(64);
    expect(() => prepareAutomaticRelease(args)).toThrow(/terms changed/);
  });

  it('treats expired-only calendar cleanup as a no-op after baseline verification without generating approvals', () => {
    const args = fixture();
    args.policy = extendedPolicy;
    args.tables = structuredClone(args.baselineInputs.context.tables);
    args.tables['calendar_dates.txt'] = [
      { service_id: 'WD', date: '20261106', exception_type: '2' },
    ];
    const baseline = structuredClone(args.baselineInputs);
    const result = prepareAutomaticRelease(args);
    expect(result.decision).toBe('no-op');
    expect(result.retainedManifestSha256).toBe(
      args.baselineIndex.manifestSha256,
    );
    expect(result.historicalChanges.serviceDates).toEqual(['2026-11-06']);
    expect(result.mappingApproval).toBeUndefined();
    expect(result.sourceReview).toBeUndefined();
    expect(result.bundle).toBeUndefined();
    expect(args.baselineInputs).toEqual(baseline);
    args.currentTerms.licence.sha256 = 'f'.repeat(64);
    expect(() => prepareAutomaticRelease(args)).toThrow(/terms changed/);
  });

  it('still holds a future cancellation even when the same capture contains expired-only cleanup', () => {
    const args = fixture();
    args.policy = extendedPolicy;
    args.tables = structuredClone(args.baselineInputs.context.tables);
    args.tables['calendar_dates.txt'] = [
      { service_id: 'WD', date: '20261106', exception_type: '2' },
      { service_id: 'WD', date: '20261110', exception_type: '2' },
    ];
    expect(() => prepareAutomaticRelease(args)).toThrow(
      /entire supported service date/,
    );
  });

  it('holds a redistribution that reuses a few nearby calls, while accepting a uniform time shift', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `trip-${i}`);
    const inputs = (morning: number, minutes = '00') => ({
      context: {
        tables: {
          'trips.txt': ids.map((trip_id) => ({ trip_id, direction_id: '0' })),
          'stop_times.txt': ids.map((trip_id, i) => ({
            trip_id,
            stop_id: 'P',
            arrival_time: `${i < morning ? '08' : '12'}:${minutes}:00`,
            departure_time: `${i < morning ? '08' : '12'}:${minutes}:00`,
          })),
        },
      },
    });
    const draft = {
      associationReview: {
        patterns: [
          {
            lineId: 'NEL',
            supportedServiceDates: ['2026-11-10'],
            tripIds: ids,
          },
        ],
      },
    };
    const requireCheck = (condition: boolean, reason: string) => {
      if (!condition) throw new Error(reason);
    };
    expect(() =>
      checkAutomaticDailyChanges(
        inputs(9),
        draft,
        inputs(1),
        draft,
        extendedPolicy,
        requireCheck,
      ),
    ).toThrow(/distinct timing counterparts/);
    expect(() =>
      checkAutomaticDailyChanges(
        inputs(9),
        draft,
        inputs(9, '10'),
        draft,
        extendedPolicy,
        requireCheck,
      ),
    ).not.toThrow();
  });

  it('holds when known boarding permissions move between differently timed trips', () => {
    const args = fixture('0.1', false, true);
    args.policy = extendedPolicy;
    const a = args.tables['stop_times.txt'].filter(
      (row) => row.trip_id === 'SHARED',
    );
    const b = args.tables['stop_times.txt'].filter(
      (row) => row.trip_id === 'SHARED_NO_PICKUP',
    );
    for (let i = 0; i < a.length; i++) {
      for (const key of ['pickup_type', 'drop_off_type', 'timepoint']) {
        const x = a[i][key];
        const y = b[i][key];
        if (y === undefined) delete a[i][key];
        else a[i][key] = y;
        if (x === undefined) delete b[i][key];
        else b[i][key] = x;
      }
    }
    expect(
      assessAutomaticUpdate({
        baseline: args.baselineInputs.context.tables,
        candidate: args.tables,
        previousCapture: args.previousCapture,
        capture: args.capture,
        policy: args.policy,
        now: args.now,
      }).decision,
    ).toBe('eligible');
    expect(() => prepareAutomaticRelease(args)).toThrow(
      /boarding\/access profiles/,
    );
  });

  it('uses the completed v2 release as the baseline for the next automatic successor', () => {
    const args = fixture();
    args.policy = extendedPolicy;
    const first = prepareAutomaticRelease(args);
    const nextTables = structuredClone(args.tables);
    for (const row of nextTables['stop_times.txt'])
      for (const field of ['arrival_time', 'departure_time'])
        row[field] = row[field].replace(/:10$/, ':20');
    const second = prepareAutomaticRelease({
      ...args,
      tables: nextTables,
      baselineInputs: first.inputs,
      baselineConfig: {
        correctionRevision: 1,
        draftSha256: first.draft.draftSha256,
      },
      baselineEvidence: JSON.parse(
        Buffer.from(first.bundle.files.releaseBytes).toString(),
      ),
      baselineIndex: first.bundle.index,
      previousCapture: args.capture,
      capture: {
        ...args.capture,
        sha256: 'f'.repeat(64),
        retrieved_at: '2026-11-08T02:00:00Z',
      },
      now: '2026-11-08T03:00:00Z',
      sourceManifest: {
        ...args.sourceManifest,
        'stop_times.txt': 'd'.repeat(64),
      },
    });
    expect(second.decision).toBe('ready');
    expect(second.sourceReview.predecessor.manifestSha256).toBe(
      first.bundle.index.manifestSha256,
    );
    expect(second.coverage.unassignedTripDateCount).toBe(0);
  });

  it('publishes a new contiguous short working against the dated canonical service', () => {
    const args = fixture('0.1', true);
    args.policy = extendedPolicy;
    for (const trip of args.tables['trips.txt']
      .filter((trip) => trip.trip_id.startsWith('NEL_TEST_WD'))
      .slice(0, 8)) {
      const calls = args.tables['stop_times.txt'].filter(
        (row) => row.trip_id === trip.trip_id,
      );
      calls[0].stop_id = 'Q';
      calls[1].stop_id = 'R';
    }
    const result = prepareAutomaticRelease(args);
    expect(result.decision).toBe('ready');
    expect(result.coverage.unassignedTripDateCount).toBe(0);
  });

  it('publishes a literal special calendar with rebuilt pattern IDs and complete shared memberships', () => {
    const args = fixture();
    args.policy = extendedPolicy;
    const original = args.tables['trips.txt'].filter(
      (trip) => trip.service_id === 'WD',
    );
    args.tables['calendar.txt'].push({
      ...args.tables['calendar.txt'].find((row) => row.service_id === 'WD'),
      service_id: 'SPECIAL',
      start_date: '20261110',
      end_date: '20261110',
    });
    args.tables['calendar_dates.txt'] = [
      { service_id: 'WD', date: '20261110', exception_type: '2' },
    ];
    for (const trip of original) {
      args.tables['trips.txt'].push({
        ...trip,
        trip_id: `special-${trip.trip_id}`,
        service_id: 'SPECIAL',
        block_id: 'operational-block',
      });
      args.tables['stop_times.txt'].push(
        ...args.tables['stop_times.txt']
          .filter((row) => row.trip_id === trip.trip_id)
          .map((row) => ({ ...row, trip_id: `special-${trip.trip_id}` })),
      );
    }
    const result = prepareAutomaticRelease(args);
    expect(result.decision).toBe('ready');
    expect(result.inputs.holidayPolicy.schemaVersion).toBe(2);
    expect(
      result.inputs.sharedServiceMemberships.claims.some((claim) =>
        claim.serviceDates.includes('2026-11-10'),
      ),
    ).toBe(true);
    expect(result.coverage.unassignedTripDateCount).toBe(0);
    expect(result.coverage.assignedTripDateCount).toBeGreaterThan(0);
  });

  it('holds special service on a public holiday, changed access and unknown paths', () => {
    const holiday = fixture();
    holiday.policy = extendedPolicy;
    holiday.tables['calendar_dates.txt'] = [
      { service_id: 'WD', date: '20261109', exception_type: '2' },
    ];
    expect(() => prepareAutomaticRelease(holiday)).toThrow(/public holidays/);
    const access = fixture();
    access.policy = extendedPolicy;
    access.tables['stop_times.txt'][0].pickup_type = '3';
    expect(prepareAutomaticRelease(access).decision).toBe('hold');
    const path = fixture();
    path.policy = extendedPolicy;
    const call = path.tables['stop_times.txt'].find(
      (row) => row.trip_id === 'NEL_TEST_WD',
    );
    if (!call) throw new Error('Missing fixture call');
    call.stop_id = 'R';
    expect(() => prepareAutomaticRelease(path)).toThrow(/unresolved/);
  });

  it('holds date-specific cancellations and timing anomalies under the extended policy', () => {
    const cancelled = fixture();
    cancelled.policy = extendedPolicy;
    cancelled.tables['calendar_dates.txt'] = [
      { service_id: 'WD', date: '20261110', exception_type: '2' },
    ];
    expect(() => prepareAutomaticRelease(cancelled)).toThrow(
      /entire supported service date/,
    );
    const shifted = fixture();
    shifted.policy = extendedPolicy;
    shifted.tables['stop_times.txt'][0].arrival_time = '40:00:00';
    shifted.tables['stop_times.txt'][0].departure_time = '40:00:00';
    expect(prepareAutomaticRelease(shifted).decision).toBe('hold');
    const later = fixture();
    later.policy = extendedPolicy;
    for (const row of later.tables['stop_times.txt']) {
      for (const field of ['arrival_time', 'departure_time'])
        row[field] = row[field].replace(/^25:/, '27:');
    }
    expect(() => prepareAutomaticRelease(later)).toThrow(
      /distinct timing counterparts/,
    );
  });
  it('generates exact automated approvals only after reconstructing a complete equivalent mapping', () => {
    const args = fixture();
    const before = structuredClone(args.baselineInputs);
    const result = prepareAutomaticRelease(args);
    expect(result.decision).toBe('ready');
    expect(result.coverage.unassignedTripDateCount).toBe(0);
    expect(result.mappingApproval.reviewer).toContain('automatic');
    expect(result.mappingApproval.reason).toContain(args.runUrl);
    expect(result.sourceReview.predecessor.manifestSha256).toBe(
      args.baselineIndex.manifestSha256,
    );
    expect(result.sourceReview.successor.snapshotSha256).toBe(
      args.capture.sha256,
    );
    expect(result.sourceReview.decision).toBe('resolve-version-conflict');
    expect(args.baselineInputs).toEqual(before);
  });

  it.each([
    null,
    '',
  ])('uses successor admission for an absent or empty provider version: %s', (version) => {
    const result = prepareAutomaticRelease(fixture(version));
    expect(result.decision).toBe('ready');
    expect(result.sourceReview.decision).toBe('successor');
  });

  it('holds malformed or missing declared source bounds before generating approvals', () => {
    for (const value of ['', '20261301']) {
      const args = fixture();
      args.baselineInputs.context.tables['feed_info.txt'][0].feed_start_date =
        value;
      args.tables['feed_info.txt'][0].feed_start_date = value;
      expect(() => prepareAutomaticRelease(args)).toThrow(/feed|date/i);
    }
  });

  it.each([
    'calendar.txt',
    'calendar_dates.txt',
    'stops.txt',
    'feed_info.txt',
  ])('holds changed %s', (name) => {
    const args = fixture();
    args.tables[name] = [...(args.tables[name] ?? []), { changed: 'yes' }];
    expect(prepareAutomaticRelease(args).decision).toBe('hold');
  });

  it('holds changed boarding rules and new paths even when a source pattern still has the same ID', () => {
    const args = fixture();
    args.tables['stop_times.txt'][0].pickup_type = '1';
    expect(prepareAutomaticRelease(args).decision).toBe('hold');
  });

  it('holds large cancellations and time shifts', () => {
    const args = fixture();
    args.tables['trips.txt'] = args.tables['trips.txt'].slice(1);
    expect(prepareAutomaticRelease(args).decision).toBe('hold');
    const shift = fixture();
    shift.tables['stop_times.txt'][0].departure_time = '40:00:00';
    expect(prepareAutomaticRelease(shift).decision).toBe('hold');
  });

  it('holds stale, future and older captures', () => {
    for (const retrieved_at of [
      '2026-01-01T00:00:00Z',
      '2027-01-01T00:00:00Z',
      '2026-11-04T00:00:00Z',
    ]) {
      const args = fixture();
      args.capture.retrieved_at = retrieved_at;
      expect(prepareAutomaticRelease(args).decision).toBe('hold');
    }
  });

  it('does nothing for a duplicate ZIP', () => {
    const args = fixture();
    args.capture.sha256 = args.previousCapture.sha256;
    expect(prepareAutomaticRelease(args).decision).toBe('unchanged');
  });

  it('cannot use old approval evidence for changed topology, terms, applicability or unresolved mappings', () => {
    const terms = fixture();
    terms.currentTerms.licence.sha256 = 'f'.repeat(64);
    expect(() => prepareAutomaticRelease(terms)).toThrow(/terms changed/);
    const expired = fixture();
    expired.now = '2026-12-01T01:00:00Z';
    expired.capture.retrieved_at = '2026-12-01T00:00:00Z';
    expect(() => prepareAutomaticRelease(expired)).toThrow(/window/);
    const topology = fixture();
    topology.baselineInputs.context.topology.stations[0].platforms[0].boardingStatus =
      'not_in_service';
    expect(() => prepareAutomaticRelease(topology)).toThrow();
    const missing = fixture();
    missing.baselineInputs.sharedServiceMemberships = undefined;
    expect(() => prepareAutomaticRelease(missing)).toThrow();
  });

  it('requires an authentic repository workflow URL for provenance', () => {
    expect(() =>
      prepareAutomaticRelease({
        ...fixture(),
        runUrl: 'https://example.com/review',
      }),
    ).toThrow(/trusted workflow/);
  });

  it('allows trip renaming and source row reordering without changing semantic gates', () => {
    const args = fixture();
    args.tables['trips.txt'].forEach((row) => {
      row.trip_id = `new-${row.trip_id}`;
    });
    args.tables['stop_times.txt'].forEach((row) => {
      row.trip_id = `new-${row.trip_id}`;
    });
    args.tables['stops.txt'].reverse();
    expect(
      assessAutomaticUpdate({
        baseline: args.baselineInputs.context.tables,
        candidate: args.tables,
        previousCapture: args.previousCapture,
        capture: args.capture,
        policy,
        now: args.now,
      }).decision,
    ).toBe('eligible');
  });
});
