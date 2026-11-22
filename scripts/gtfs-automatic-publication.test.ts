import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { combinedArtifactFixture } from '../packages/fs/src/gtfs/__tests__/combinedArtifactFixture.js';
import { inspectCombinedTimetableRelease } from '../packages/fs/src/gtfs/combinedTimetableRelease.js';
import { createScheduledCombinedReview } from '../packages/fs/src/gtfs/scheduledCombinedReview.js';
import { assessAutomaticUpdate } from './gtfs-automatic-eligibility.mjs';
import { prepareAutomaticRelease } from './prepare-gtfs-automatic-release.mjs';

const policy = JSON.parse(
  readFileSync(
    new URL(
      '../docs/gtfs/operations/automatic-publication-policy.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

function fixture(feedVersion: string | null = '0.1') {
  const { inputs, capture: receipt } = combinedArtifactFixture();
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

describe('automatic GTFS publication', () => {
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
