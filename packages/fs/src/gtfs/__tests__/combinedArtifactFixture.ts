import { combinedReviewFixture } from './combinedReviewFixture.js';

export function combinedArtifactFixture() {
  const { inputs, sharedServiceMemberships } = combinedReviewFixture(
    true,
    true,
  );
  return {
    inputs: { ...inputs, sharedServiceMemberships },
    capture: {
      schema_version: 1,
      capture_id: 'synthetic',
      feed_kind: 'schedule',
      source:
        'https://datamall2.mytransport.sg/ltaodataservice/GTFSScheduleTrain',
      retrieved_at: '2026-11-02T20:00:00Z',
      provider_timestamp: null,
      sha256: inputs.captureSha256,
      byte_length: 1,
      archive_ref: 'synthetic/schedule.zip',
      attribution: 'Synthetic fixture',
      rights_status: 'pending_review',
      licence_reference: 'https://example.org/licence',
    },
  };
}
