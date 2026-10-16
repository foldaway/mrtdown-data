import { describe, expect, it } from 'vitest';
import { hashBytes } from './capture.js';
import { evaluateScopedReconciliation } from './scopedReview.js';
import {
  type ScopedReconciliationDraft,
  type ScopedReviewContext,
  scopedReviewDateSetId,
  scopedReviewDraftSha256,
} from './scopedReviewContract.js';
import { createScopedReconciliationDraft } from './scopedReviewDraft.js';

function fixture(): ScopedReviewContext {
  const tables = {
    'agency.txt': [{ agency_id: 'SMRT' }, { agency_id: 'LTA' }],
    'routes.txt': [
      { route_id: 'NSL_TEST', agency_id: 'SMRT', route_type: '1' },
    ],
    'stops.txt': [
      { stop_id: 'S', stop_code: 'NS1', location_type: '1' },
      {
        stop_id: 'P',
        stop_code: 'NS1',
        parent_station: 'S',
        platform_code: 'A',
        location_type: '0',
      },
      { stop_id: 'D', stop_code: 'NS2', location_type: '1' },
      {
        stop_id: 'Q',
        stop_code: 'NS2',
        parent_station: 'D',
        platform_code: 'B',
        location_type: '0',
      },
    ],
    'calendar.txt': [
      {
        service_id: 'C',
        monday: '1',
        tuesday: '1',
        wednesday: '1',
        thursday: '1',
        friday: '1',
        saturday: '1',
        sunday: '1',
        start_date: '20260101',
        end_date: '20260103',
      },
    ],
    'trips.txt': [
      {
        route_id: 'NSL_TEST',
        service_id: 'C',
        trip_id: 'T',
        direction_id: '0',
      },
    ],
    'stop_times.txt': [
      {
        trip_id: 'T',
        stop_id: 'P',
        stop_sequence: '1',
        arrival_time: '08:00:00',
        departure_time: '08:00:00',
      },
      {
        trip_id: 'T',
        stop_id: 'Q',
        stop_sequence: '2',
        arrival_time: '08:02:00',
        departure_time: '08:02:00',
      },
    ],
  };
  const topology = {
    projectionVersion: 1,
    operators: [{ id: 'SMRT_TRAINS' }],
    lines: [
      {
        id: 'NSL',
        type: 'mrt',
        serviceIds: ['SVC'],
        operators: [
          { operatorId: 'SMRT_TRAINS', startedAt: '2000-01-01', endedAt: null },
        ],
      },
    ],
    stations: ['S', 'D'].map((id, index) => ({
      id,
      stationCodes: [
        {
          lineId: 'NSL',
          code: `NS${index + 1}`,
          startedAt: '2000-01-01',
          endedAt: null,
        },
      ],
      platforms: [
        {
          id: `platform-${id}`,
          label: index ? 'B' : 'A',
          lineId: 'NSL',
          serviceIds: ['SVC'],
          boardingStatus: null,
        },
      ],
    })),
    services: [
      {
        id: 'SVC',
        lineId: 'NSL',
        revisions: [
          {
            id: 'R',
            startAt: '2000-01-01',
            endAt: null,
            stations: [
              { stationId: 'S', displayCode: 'NS1' },
              { stationId: 'D', displayCode: 'NS2' },
            ],
          },
        ],
      },
    ],
  } as ScopedReviewContext['topology'];
  return {
    tables,
    topology,
    identity: {
      sourceManifest: { 'stops.txt': 'a'.repeat(64) },
      canonicalCommit: 'b'.repeat(40),
      topology: {
        projectionVersion: 1,
        sha256: hashBytes(Buffer.from(JSON.stringify(topology))),
      },
    },
  };
}
function draftFor(context = fixture()) {
  return createScopedReconciliationDraft(context, {
    pilotLineIds: ['NSL'],
    preparedBy: 'Codex synthetic proposal',
  });
}
function ignorePublisher(draft: ScopedReconciliationDraft) {
  const item = draft.decisions.find(
    (item) => item.kind === 'agency' && item.providerId === 'LTA',
  );
  if (!item) throw new Error('missing fixture');
  item.disposition = 'ignored';
  item.reason = 'Synthetic explicit disposition for unused publisher.';
  return draft;
}
function approval(draft: ScopedReconciliationDraft) {
  return {
    schemaVersion: 2,
    documentKind: 'gtfs-scoped-mapping-approval',
    identity: draft.identity,
    draftSha256: scopedReviewDraftSha256(draft),
    reviewer: 'Synthetic repository reviewer',
    reason: 'Synthetic approval assertion for gate tests only.',
  };
}
function rehash(context: ScopedReviewContext) {
  context.identity.topology.sha256 = hashBytes(
    Buffer.from(JSON.stringify(context.topology)),
  );
}

describe('version-2 scoped mapping drafts and review gate', () => {
  it('prepares concrete matches, retains unsupported inputs and never approves or auto-excludes', () => {
    const context = fixture(),
      draft = draftFor(context);
    const result = evaluateScopedReconciliation(context, draft);
    expect(
      draft.decisions.filter((item) => item.disposition === 'matched'),
    ).toHaveLength(7);
    expect(
      draft.decisions.filter(
        (item) =>
          item.disposition === 'excluded' || item.disposition === 'ignored',
      ),
    ).toEqual([]);
    expect(result).toMatchObject({
      valid: true,
      coverageComplete: true,
      unresolvedDecisions: 1,
      matchedPatternDates: 3,
      readiness: 'unresolved',
      approvalMatches: false,
      mappingReviewEligible: false,
      generationEligible: false,
    });
  });
  it('keeps complete proposals unapproved and binds repository review to exact text and identity', () => {
    const context = fixture(),
      draft = ignorePublisher(draftFor(context));
    expect(evaluateScopedReconciliation(context, draft)).toMatchObject({
      readiness: 'unapproved',
      mappingReviewEligible: false,
    });
    expect(
      evaluateScopedReconciliation(context, draft, approval(draft)),
    ).toMatchObject({
      reviewComplete: true,
      readiness: 'reviewed-mapping-only',
      mappingReviewEligible: true,
      generationEligible: false,
    });
    const review = approval(draft);
    draft.decisions[0].reason =
      'Edited text invalidates the previous review assertion.';
    expect(
      evaluateScopedReconciliation(context, draft, review).errors,
    ).toContain('Approval does not bind this draft and input identity');
  });
  it('requires every source entry and exact dates, even for deliberate pilot subsets', () => {
    const context = fixture(),
      draft = ignorePublisher(draftFor(context));
    draft.decisions = draft.decisions.filter(
      (item) => item.providerId !== 'LTA',
    );
    expect(
      evaluateScopedReconciliation(context, draft, approval(draft)),
    ).toMatchObject({
      valid: true,
      coverageComplete: false,
      missingEntries: ['agency:LTA'],
      mappingReviewEligible: false,
    });
    const pattern = draft.decisions.find((item) => item.kind === 'pattern');
    if (pattern?.kind !== 'pattern') throw new Error('missing fixture');
    const dates = ['2026-01-01', '2026-01-02'];
    draft.dateSets = [
      { id: scopedReviewDateSetId(dates), serviceDates: dates },
    ];
    pattern.dateSetId = draft.dateSets[0].id;
    expect(
      evaluateScopedReconciliation(context, draft).missingPatternDates[0]
        ?.serviceDates,
    ).toEqual(['2026-01-03']);
  });
  it('rejects overlapping cells, duplicated/unreferenced dates and changed source identities', () => {
    const context = fixture(),
      base = draftFor(context),
      duplicate = structuredClone(base);
    const item = duplicate.decisions.find((item) => item.kind === 'pattern');
    if (!item) throw new Error('missing fixture');
    duplicate.decisions.push(item);
    expect(
      evaluateScopedReconciliation(context, duplicate).errors.some((error) =>
        error.startsWith('Overlapping pattern'),
      ),
    ).toBe(true);
    const wrong = structuredClone(base);
    wrong.identity.canonicalCommit = 'c'.repeat(40);
    wrong.decisions[0].sourceRecordSha256 = 'd'.repeat(64);
    const errors = evaluateScopedReconciliation(context, wrong).errors;
    expect(errors.some((error) => error.includes('identity differs'))).toBe(
      true,
    );
    expect(
      errors.some((error) => error.startsWith('Unknown or changed source')),
    ).toBe(true);
    const extra = structuredClone(base);
    extra.dateSets.push({
      id: scopedReviewDateSetId(['2026-01-01', '2026-01-01']),
      serviceDates: ['2026-01-01', '2026-01-01'],
    });
    expect(
      evaluateScopedReconciliation(context, extra).errors.some((error) =>
        error.startsWith('Invalid or duplicate civil'),
      ),
    ).toBe(true);
    const unused = structuredClone(base);
    unused.dateSets.push({
      id: scopedReviewDateSetId(['2026-02-01']),
      serviceDates: ['2026-02-01'],
    });
    expect(
      evaluateScopedReconciliation(context, unused).errors.some((error) =>
        error.startsWith('Unused date set'),
      ),
    ).toBe(true);
    const noncivil = structuredClone(base);
    noncivil.dateSets.push({
      id: scopedReviewDateSetId(['2026-02-30']),
      serviceDates: ['2026-02-30'],
    });
    expect(() => evaluateScopedReconciliation(context, noncivil)).toThrow();
  });
  it('cannot waive temporal gaps as matches; explicit exclusions remain excluded coverage', () => {
    const context = fixture();
    context.topology.services[0].revisions[0].startAt = '2026-01-02';
    rehash(context);
    const draft = ignorePublisher(draftFor(context));
    const unresolved = draft.decisions.find(
      (item) => item.kind === 'pattern' && item.disposition === 'unresolved',
    );
    const matched = draft.decisions.find(
      (item) => item.kind === 'pattern' && item.disposition === 'matched',
    );
    if (unresolved?.kind !== 'pattern' || !matched?.target)
      throw new Error('missing fixture');
    unresolved.disposition = 'matched';
    unresolved.target = matched.target;
    expect(
      evaluateScopedReconciliation(context, draft, approval(draft)).errors.some(
        (error) => error.startsWith('Target outside temporal candidates'),
      ),
    ).toBe(true);
    unresolved.disposition = 'excluded';
    delete unresolved.target;
    unresolved.reason =
      'Synthetic explicit exclusion of the out-of-period date; no match is claimed.';
    expect(
      evaluateScopedReconciliation(context, draft, approval(draft)),
    ).toMatchObject({
      valid: true,
      matchedPatternDates: 2,
      excludedPatternDates: 1,
      mappingReviewEligible: true,
      generationEligible: false,
    });
  });
  it('rejects unknown date-set references and dates outside the actual pattern calendar', () => {
    const context = fixture(),
      draft = draftFor(context);
    const pattern = draft.decisions.find((item) => item.kind === 'pattern');
    if (pattern?.kind !== 'pattern') throw new Error('missing fixture');
    pattern.dateSetId = 'f'.repeat(64);
    expect(evaluateScopedReconciliation(context, draft).errors).toContain(
      `Unknown date set: ${pattern.dateSetId}`,
    );
    const dates = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'];
    pattern.dateSetId = scopedReviewDateSetId(dates);
    draft.dateSets = [{ id: pattern.dateSetId, serviceDates: dates }];
    expect(
      evaluateScopedReconciliation(context, draft).errors.some((error) =>
        error.startsWith('Date outside source calendar'),
      ),
    ).toBe(true);
  });
  it('does not turn empty calendars or missing inactive decisions into matched readiness', () => {
    const context = fixture();
    for (const row of context.tables['calendar.txt'] ?? [])
      for (const day of [
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
      ])
        row[day] = '0';
    const draft = ignorePublisher(draftFor(context));
    const pattern = draft.decisions.find((item) => item.kind === 'pattern');
    if (pattern?.kind !== 'pattern') throw new Error('missing fixture');
    expect(pattern.disposition).toBe('inactive');
    expect(
      evaluateScopedReconciliation(context, draft, approval(draft)),
    ).toMatchObject({
      valid: true,
      reviewComplete: true,
      matchedPatternDates: 0,
      readiness: 'no-matched-dates',
      mappingReviewEligible: false,
    });
    pattern.disposition = 'matched';
    pattern.target = {
      kind: 'serviceRevision',
      id: 'SVC',
      revisionId: 'R',
      match: 'exact',
    };
    expect(
      evaluateScopedReconciliation(context, draft).errors.some((error) =>
        error.startsWith('Matched cell has no active dates'),
      ),
    ).toBe(true);
    draft.decisions = draft.decisions.filter((item) => item.kind !== 'pattern');
    expect(evaluateScopedReconciliation(context, draft).coverageComplete).toBe(
      false,
    );
  });
  it('rejects fabricated targets, unresolved parents and operator-period mismatches', () => {
    const context = fixture(),
      draft = draftFor(context);
    const pattern = draft.decisions.find((item) => item.kind === 'pattern');
    if (!pattern) throw new Error('missing fixture');
    pattern.target = {
      kind: 'serviceRevision',
      id: 'fabricated',
      revisionId: 'R',
      match: 'exact',
    };
    expect(
      evaluateScopedReconciliation(context, draft).errors.some((error) =>
        error.startsWith('Target outside source candidates'),
      ),
    ).toBe(true);
    const dependency = draftFor(context);
    const station = dependency.decisions.find(
      (item) => item.kind === 'stop' && item.providerId === 'S',
    );
    if (!station) throw new Error('missing fixture');
    station.disposition = 'unresolved';
    delete station.target;
    expect(
      evaluateScopedReconciliation(context, dependency).errors.some((error) =>
        error.startsWith('Unmatched dependency'),
      ),
    ).toBe(true);
    const operatorDraft = draftFor(context);
    context.topology.lines[0].operators[0].startedAt = '2026-01-02';
    rehash(context);
    operatorDraft.identity = context.identity;
    expect(
      evaluateScopedReconciliation(context, operatorDraft).errors.some(
        (error) => error.startsWith('Agency/line operator period mismatch'),
      ),
    ).toBe(true);
    expect(
      evaluateScopedReconciliation(context, draftFor(context)),
    ).toMatchObject({ valid: true, unresolvedPatternDates: 1 });
  });
  it('does not propose routes or children whose agency or parent remains unresolved', () => {
    const context = fixture();
    const agency = context.tables['agency.txt']?.find(
      (row) => row.agency_id === 'SMRT',
    );
    const route = context.tables['routes.txt']?.[0];
    if (!agency || !route) throw new Error('missing fixture');
    agency.agency_id = 'UNSUPPORTED';
    route.agency_id = 'UNSUPPORTED';
    const unknown = draftFor(context);
    expect(
      unknown.decisions.find((item) => item.kind === 'route')?.disposition,
    ).toBe('unresolved');
    expect(evaluateScopedReconciliation(context, unknown).valid).toBe(true);
    const ambiguous = fixture();
    ambiguous.topology.stations.push({
      ...ambiguous.topology.stations[0],
      id: 'OLD_S',
      platforms: [],
    });
    rehash(ambiguous);
    const unresolved = draftFor(ambiguous);
    expect(
      unresolved.decisions.find(
        (item) => item.kind === 'stop' && item.providerId === 'P',
      )?.disposition,
    ).toBe('unresolved');
    expect(evaluateScopedReconciliation(ambiguous, unresolved).valid).toBe(
      true,
    );
  });
  it('rejects inconsistent child/parent targets even with approval metadata', () => {
    const context = fixture(),
      draft = draftFor(context);
    const parent = draft.decisions.find(
      (item) => item.kind === 'stop' && item.providerId === 'S',
    );
    if (!parent) throw new Error('missing fixture');
    parent.target = { kind: 'station', id: 'D' };
    expect(
      evaluateScopedReconciliation(context, draft, approval(draft)).errors,
    ).toContain('Child/parent station target mismatch: stop:P');
  });
  it('defers literal groups and same-label alternatives instead of claiming a selected allocation', () => {
    const context = fixture();
    const stop = context.tables['stops.txt']?.find(
      (row) => row.stop_id === 'P',
    );
    if (!stop) throw new Error('missing fixture');
    stop.platform_code = 'A / X';
    const draft = draftFor(context);
    const selected = draft.decisions.find(
      (item) => item.kind === 'stop' && item.providerId === 'P',
    );
    if (!selected) throw new Error('missing fixture');
    selected.disposition = 'matched';
    selected.target = { kind: 'platform', id: 'platform-S', stationId: 'S' };
    expect(
      evaluateScopedReconciliation(context, draft).errors.some((error) =>
        error.startsWith('Grouped or missing platform'),
      ),
    ).toBe(true);
    stop.platform_code = 'A';
    context.topology.stations[0].platforms.push({
      ...context.topology.stations[0].platforms[0],
      id: 'other-A',
      serviceIds: ['OTHER'],
    });
    rehash(context);
    const alternative = draftFor(context);
    const item = alternative.decisions.find(
      (item) => item.kind === 'stop' && item.providerId === 'P',
    );
    if (!item) throw new Error('missing fixture');
    item.disposition = 'matched';
    item.target = { kind: 'platform', id: 'other-A', stationId: 'S' };
    expect(
      evaluateScopedReconciliation(context, alternative).errors.some((error) =>
        error.startsWith(
          'Physical platform or station allocation is not unique',
        ),
      ),
    ).toBe(true);
  });
  it('preserves draft bytes under source order changes and normalized digests under draft ordering', () => {
    const context = fixture(),
      draft = draftFor(context);
    for (const rows of Object.values(context.tables)) rows.reverse();
    expect(JSON.stringify(draftFor(context))).toBe(JSON.stringify(draft));
    const reordered = structuredClone(draft);
    reordered.decisions.reverse();
    reordered.dateSets.reverse();
    for (const set of reordered.dateSets) set.serviceDates.reverse();
    expect(scopedReviewDraftSha256(reordered)).toBe(
      scopedReviewDraftSha256(draft),
    );
  });
});
