import { describe, expect, it } from 'vitest';
import { combinedArtifactFixture } from './__tests__/combinedArtifactFixture.js';
import { hashBytes } from './capture.js';
import { projectCombinedTimetableServiceDay } from './combinedTimetableDepartures.js';
import {
  inspectCombinedTimetableRelease,
  verifyCombinedTimetableReleaseBundle,
} from './combinedTimetableRelease.js';
import { createScheduledCombinedReview } from './scheduledCombinedReview.js';

function fixture(complete = true) {
  const { inputs, capture } = combinedArtifactFixture();
  const context = complete
    ? inputs
    : { ...inputs, sharedServiceMemberships: undefined };
  const draft = createScheduledCombinedReview(context);
  const currentTerms = {
    licence: { reference: capture.licence_reference, sha256: 'a'.repeat(64) },
    apiTerms: {
      reference:
        'https://datamall.lta.gov.sg/content/datamall/en/api-terms-of-service.html',
      sha256: 'b'.repeat(64),
    },
  };
  const options = {
    correctionRevision: 1,
    currentLicenceReference: currentTerms.licence.reference,
    releaseInstant: '2026-11-07T20:00:00Z',
    currentTerms,
    mappingApproval: {
      schemaVersion: 1,
      documentKind: 'gtfs-combined-mapping-approval',
      identity: draft.identity,
      draftSha256: draft.draftSha256,
      reviewer: 'Synthetic mapping reviewer',
      reason: 'Synthetic fixture approval',
    },
  };
  capture.rights_status = 'redistribution_permitted';
  const candidate = inspectCombinedTimetableRelease(
    context,
    draft,
    capture,
    options,
  );
  const releaseReview = {
    schemaVersion: 1,
    documentKind: 'gtfs-timetable-release-review',
    manifestSha256: candidate.manifestSha256,
    mappingApprovalSha256: candidate.manifest.mappingApprovalSha256,
    reviewer: 'Synthetic release reviewer',
    reviewedAt: '2026-11-06T20:00:00Z',
    decision: 'release-permitted',
    terms: currentTerms,
    licenceVersion: 'synthetic-v1',
    obligations: 'Synthetic attribution',
    captureConditions: 'Synthetic acquisition conditions',
    effectiveAt: null,
  };
  return { inputs: context, draft, capture, options, candidate, releaseReview };
}

// Rebind synthetic metadata to exercise structural checks after hash verification.
function verifyEditedArtifact(
  verified: ReturnType<typeof verifyCombinedTimetableReleaseBundle>,
  topology: Parameters<typeof verifyCombinedTimetableReleaseBundle>[2],
) {
  const timetableBytes = Buffer.from(JSON.stringify(verified.artifact));
  const manifestBytes = Buffer.from(
    JSON.stringify({
      ...verified.manifest,
      timetable: {
        sha256: hashBytes(timetableBytes),
        byteLength: timetableBytes.byteLength,
      },
    }),
  );
  const manifestSha256 = hashBytes(manifestBytes);
  const releaseBytes = Buffer.from(
    JSON.stringify({
      ...verified.evidence,
      releaseReview: { ...verified.evidence.releaseReview, manifestSha256 },
    }),
  );
  return verifyCombinedTimetableReleaseBundle(
    { manifestSha256, releaseSha256: hashBytes(releaseBytes) },
    { manifestBytes, timetableBytes, releaseBytes },
    topology,
  );
}

describe('combined timetable release', () => {
  it('packages and verifies exact approved bytes for the installed canonical topology', () => {
    const { inputs, draft, capture, options, candidate, releaseReview } =
      fixture();
    expect(candidate.release.blockers).toEqual(['Release review is missing']);
    expect(candidate.bundle).toBeNull();
    const result = inspectCombinedTimetableRelease(inputs, draft, capture, {
      ...options,
      releaseReview,
    });
    expect(result.release.eligible).toBe(true);
    if (!result.bundle) throw new Error('Missing synthetic release bundle');
    const { index, files } = result.bundle;
    const topology = inputs.context.topology;
    const verified = verifyCombinedTimetableReleaseBundle(
      index,
      files,
      topology,
    );
    expect(verified.manifest).toEqual(result.manifest);
    expect(verified.manifest.serviceDateRange).toEqual({
      startDate: '2026-11-01',
      endDateExclusive: '2026-12-01',
    });
    const day = projectCombinedTimetableServiceDay(
      verified.artifact,
      '2026-11-30',
    );
    expect(day?.activeTripCount).toBe(4);
    expect(
      [...(day?.departures ?? [])].find(
        (departure) => departure.providerTripId === 'SHARED',
      )?.boardingByService,
    ).toHaveLength(2);
    expect(
      projectCombinedTimetableServiceDay(verified.artifact, '2026-12-01'),
    ).toBeNull();
    expect(() =>
      verifyCombinedTimetableReleaseBundle(index, files, {
        ...topology,
        stations: [],
      }),
    ).toThrow(/differs from canonical data/);
    expect(() =>
      verifyCombinedTimetableReleaseBundle(
        index,
        { ...files, releaseBytes: Buffer.from('{}') },
        topology,
      ),
    ).toThrow(/expected SHA-256/);

    // Even matching digests and synthetic reviews cannot make missing rows complete.
    verified.artifact.assignments.pop();
    expect(() => verifyEditedArtifact(verified, topology)).toThrow(
      /complete supported coverage/,
    );
  });

  it('rejects boardable calls without a reviewed allocation or at a restricted platform', () => {
    const { inputs, draft, capture, options, releaseReview } = fixture();
    const { bundle } = inspectCombinedTimetableRelease(inputs, draft, capture, {
      ...options,
      releaseReview,
    });
    if (!bundle) throw new Error('Missing synthetic release bundle');
    const topology = inputs.context.topology;
    const verified = verifyCombinedTimetableReleaseBundle(
      bundle.index,
      bundle.files,
      topology,
    );
    const unusual = verified.artifact.assignments.find(
      ({ providerTripId }) => providerTripId === 'UNUSUAL',
    );
    if (!unusual) throw new Error('Missing unusual fixture trip');
    const [origin, terminal] =
      verified.artifact.patterns[unusual.patternId].calls;
    const [access] = terminal.platforms[0].accessByService;
    expect(access).toMatchObject({
      serviceId: 'SVC',
      serviceScope: 'listed',
      passengerBoardingEligible: true,
    });

    access.serviceScope = 'unspecified';
    expect(() => verifyEditedArtifact(verified, topology)).toThrow(
      'Combined timetable boarding access differs from canonical topology for SVC at D/platform-D',
    );

    access.serviceScope = 'listed';
    const restricted = origin.platforms.find(
      ({ platformId }) => platformId === 'S_C',
    );
    if (!restricted) throw new Error('Missing restricted fixture platform');
    restricted.boardingStatus = null;
    restricted.accessByService[0].passengerBoardingEligible = true;
    expect(() => verifyEditedArtifact(verified, topology)).toThrow(
      'Combined timetable boarding access differs from canonical topology for SVC at S/S_C',
    );
  });

  it('withholds a bundle when mapping, rights, terms or the release decision are stale or incomplete', () => {
    const { inputs, draft, capture, options, releaseReview } = fixture();
    const missing = inspectCombinedTimetableRelease(
      inputs,
      draft,
      { ...capture, rights_status: 'pending_review' },
      {
        ...options,
        mappingApproval: undefined,
        currentTerms: undefined,
      },
    );
    expect(missing.release.blockers).toEqual([
      'Mapping review is not complete',
      'Capture redistribution is not permitted',
      'Current terms have not been supplied',
      'Release review is missing',
    ]);
    expect(missing.bundle).toBeNull();
    const stale = inspectCombinedTimetableRelease(inputs, draft, capture, {
      ...options,
      correctionRevision: 2,
      releaseReview: { ...releaseReview, effectiveAt: '2026-11-08T20:00:00Z' },
      currentTerms: {
        ...options.currentTerms,
        apiTerms: { ...options.currentTerms.apiTerms, sha256: 'c'.repeat(64) },
      },
    });
    expect(stale.release.blockers).toEqual([
      'Release review does not bind this artifact',
      'Release review does not match current terms',
      'Release precedes the reviewed Effective Date',
    ]);
    expect(stale.bundle).toBeNull();
    expect(() =>
      inspectCombinedTimetableRelease(inputs, draft, capture, {
        ...options,
        mappingApproval: {
          ...options.mappingApproval,
          draftSha256: 'c'.repeat(64),
        },
      }),
    ).toThrow(/does not bind this combined mapping report/);

    const partial = fixture(false);
    const result = inspectCombinedTimetableRelease(
      partial.inputs,
      partial.draft,
      partial.capture,
      {
        ...partial.options,
        releaseReview: partial.releaseReview,
      },
    );
    expect(result.release.blockers).toEqual(['Mapping review is not complete']);
    expect(result.bundle).toBeNull();
  });
});
