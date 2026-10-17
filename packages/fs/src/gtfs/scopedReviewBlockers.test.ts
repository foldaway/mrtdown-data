import { describe, expect, it } from 'vitest';
import { hashBytes } from './capture.js';
import { buildScopedReviewBlockers } from './scopedReviewBlockers.js';
import {
  type ScopedReviewContext,
  scopedReviewDateSetId,
  scopedReviewDraftSha256,
} from './scopedReviewContract.js';
import {
  createGroupedScopedReconciliationDraft,
  createScopedReconciliationDraft,
} from './scopedReviewDraft.js';

function fixture(): ScopedReviewContext {
  return {
    identity: {
      canonicalCommit: 'b'.repeat(40),
      sourceManifest: { 'stops.txt': 'a'.repeat(64) },
      topology: { projectionVersion: 1, sha256: 'c'.repeat(64) },
    },
    tables: {
      'agency.txt': [{ agency_id: 'SMRT' }, { agency_id: 'LTA' }],
      'routes.txt': [{ route_id: 'NSL_TEST', agency_id: 'SMRT' }],
      'stops.txt': [
        { stop_id: 'S', stop_code: 'NS1', location_type: '1' },
        {
          stop_id: 'P',
          stop_code: 'NS1',
          parent_station: 'S',
          platform_code: 'A',
        },
        { stop_id: 'D', stop_code: 'NS2', location_type: '1' },
        {
          stop_id: 'Q',
          stop_code: 'NS2',
          parent_station: 'D',
          platform_code: 'B',
        },
      ],
      'calendar_dates.txt': ['20260101', '20260103', '20260105'].map(
        (date) => ({ service_id: 'C', date, exception_type: '1' }),
      ),
      'trips.txt': [
        {
          trip_id: 'T',
          route_id: 'NSL_TEST',
          service_id: 'C',
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
    },
    topology: {
      projectionVersion: 1,
      operators: [{ id: 'SMRT_TRAINS' }],
      lines: [
        {
          id: 'NSL',
          type: 'mrt',
          serviceIds: ['SVC'],
          operators: [
            { operatorId: 'SMRT_TRAINS', startedAt: null, endedAt: null },
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
    },
  };
}
function draftFor(context: ScopedReviewContext) {
  context.identity.topology.sha256 = hashBytes(
    Buffer.from(JSON.stringify(context.topology)),
  );
  return createGroupedScopedReconciliationDraft(context, {
    pilotLineIds: ['NSL'],
    preparedBy: 'Synthetic blocker test',
  });
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing test fixture');
  return value;
}
function unresolvedPattern(context: ScopedReviewContext) {
  const draft = draftFor(context);
  const item = required(
    draft.decisions.find((item) => item.kind === 'pattern'),
  );
  item.disposition = 'unresolved';
  delete item.target;
  return draft;
}

describe('scoped review blocker report', () => {
  it('reports unused agencies without turning investigation into approval or changing inputs', () => {
    const context = fixture(),
      draft = draftFor(context),
      before = JSON.stringify({ context, draft });
    const report = buildScopedReviewBlockers(context, draft);
    expect(report).toMatchObject({
      draftSchemaVersion: 3,
      coverageComplete: true,
      unresolvedDecisionCount: 1,
      unresolvedPatternDateCount: 0,
      generationEligible: false,
    });
    expect(report.entities[0]).toMatchObject({
      providerId: 'LTA',
      codes: ['no-entity-candidate', 'outside-pilot', 'unused-agency'],
    });
    expect(report.patterns).toEqual([]);
    expect(JSON.stringify({ context, draft })).toBe(before);
  });
  it('pinpoints missing literal members and unresolved dependencies without collapsing a group', () => {
    const context = fixture();
    required(
      context.tables['stops.txt']?.find((row) => row.stop_id === 'P'),
    ).platform_code = 'A/C';
    const report = buildScopedReviewBlockers(context, draftFor(context));
    const stop = required(
      report.entities.find((item) => item.providerId === 'P'),
    );
    expect(stop.codes).toContain('incomplete-or-ambiguous-platform-group');
    expect(stop.platformEvidence?.stationCandidates[0]?.members).toEqual([
      { label: 'A', platformIds: ['platform-S'] },
      { label: 'C', platformIds: [] },
    ]);
    expect(stop.platformEvidence?.completeGroup).toBeNull();
    expect(report.patterns[0]?.unmatchedDependencies).toContainEqual({
      kind: 'stop',
      providerId: 'P',
      disposition: 'unresolved',
    });
    expect(report.countsByCode['unmatched-dependency']).toEqual({
      entityCount: 0,
      patternCellCount: 1,
      patternDateCount: 3,
    });
  });
  it.each([
    undefined,
    '',
  ])('does not treat absent platform code %j as malformed source text', (platformCode) => {
    const context = fixture();
    const source = required(
      context.tables['stops.txt']?.find((row) => row.stop_id === 'P'),
    );
    if (platformCode === undefined) delete source.platform_code;
    else source.platform_code = platformCode;
    const report = buildScopedReviewBlockers(context, draftFor(context));
    const stop = required(
      report.entities.find((item) => item.providerId === 'P'),
    );
    expect(stop.codes).not.toContain('malformed-platform-label');
    expect(stop.platformEvidence).toMatchObject({
      literalLabels: [],
      labelsWellFormed: true,
      stationCandidates: [{ members: [] }],
    });
    expect(report.countsByCode['malformed-platform-label']).toBeUndefined();
  });
  it.each([
    '2',
    '3',
    '4',
  ])('does not attach platform evidence to location type %s', (locationType) => {
    const context = fixture();
    const source = required(
      context.tables['stops.txt']?.find((row) => row.stop_id === 'P'),
    );
    source.location_type = locationType;
    delete source.platform_code;
    const report = buildScopedReviewBlockers(context, draftFor(context));
    const stop = required(
      report.entities.find((item) => item.providerId === 'P'),
    );
    expect(stop.platformEvidence).toBeUndefined();
    expect(stop.codes).not.toContain('malformed-platform-label');
    expect(report.countsByCode['malformed-platform-label']).toBeUndefined();
  });
  it.each([
    'A/',
    'A/A',
  ])('retains malformed classifications for supplied label %s', (platformCode) => {
    const context = fixture();
    required(
      context.tables['stops.txt']?.find((row) => row.stop_id === 'P'),
    ).platform_code = platformCode;
    const report = buildScopedReviewBlockers(context, draftFor(context));
    expect(
      report.entities.find((item) => item.providerId === 'P')?.codes,
    ).toContain('malformed-platform-label');
  });
  it('distinguishes the V2 complete-group limitation from an unresolved V3 review', () => {
    const context = fixture();
    required(
      context.tables['stops.txt']?.find((row) => row.stop_id === 'P'),
    ).platform_code = 'A/C';
    const station = required(context.topology.stations[0]);
    station.platforms.push({
      ...required(station.platforms[0]),
      id: 'platform-C',
      label: 'C',
    });
    draftFor(context);
    const v2 = createScopedReconciliationDraft(context, {
      pilotLineIds: ['NSL'],
      preparedBy: 'Synthetic V2',
    });
    const report = buildScopedReviewBlockers(context, v2);
    expect(report.draftSha256).toBe(scopedReviewDraftSha256(v2));
    expect(
      report.entities.find((item) => item.providerId === 'P')?.codes,
    ).toContain('platform-group-requires-v3');
    const v3 = draftFor(context),
      item = required(v3.decisions.find((item) => item.providerId === 'P'));
    item.disposition = 'unresolved';
    delete item.target;
    const pattern = required(
      v3.decisions.find((item) => item.kind === 'pattern'),
    );
    pattern.disposition = 'unresolved';
    delete pattern.target;
    const codes = buildScopedReviewBlockers(context, v3).entities.find(
      (item) => item.providerId === 'P',
    )?.codes;
    expect(codes).not.toContain('platform-group-requires-v3');
    expect(codes).toContain('review-required');
  });
  it('partitions only actual active dates at exclusive revision boundaries', () => {
    const context = fixture();
    required(context.topology.services[0]?.revisions[0]).startAt = '2026-01-03';
    required(context.topology.services[0]?.revisions[0]).endAt = '2026-01-05';
    const report = buildScopedReviewBlockers(context, draftFor(context));
    expect(report.patterns).toHaveLength(1);
    expect(report.patterns[0]?.dateScopes).toMatchObject([
      {
        serviceDates: ['2026-01-01', '2026-01-05'],
        temporalStatus: 'gap',
        codes: ['temporal-gap'],
      },
    ]);
    expect(report.unresolvedPatternDateCount).toBe(2);
    expect(report.countsByCode['temporal-gap']?.patternDateCount).toBe(2);
  });
  it('retains overlapping candidates rather than selecting the latest revision', () => {
    const context = fixture(),
      service = required(context.topology.services[0]);
    service.revisions.push({
      ...required(service.revisions[0]),
      id: 'R2',
      startAt: '2026-01-03',
    });
    const report = buildScopedReviewBlockers(context, draftFor(context));
    const scope = required(report.patterns[0]?.dateScopes[0]);
    expect(scope).toMatchObject({
      serviceDates: ['2026-01-03', '2026-01-05'],
      temporalStatus: 'ambiguous',
      codes: ['temporal-ambiguity'],
    });
    expect(
      scope.candidates.map((candidate) => candidate.target.revisionId).sort(),
    ).toEqual(['R', 'R2']);
  });
  it('distinguishes missing ordered geometry from temporal gaps', () => {
    const context = fixture();
    required(context.topology.services[0]?.revisions[0]).stations.reverse();
    const report = buildScopedReviewBlockers(context, draftFor(context));
    expect(report.patterns[0]?.dateScopes[0]?.codes).toEqual([
      'no-path-candidate',
      'temporal-gap',
    ]);
    expect(report.patterns[0]?.tripIds).toEqual(['T']);
    expect(report.patterns[0]?.stopIds).toEqual(['P', 'Q']);
  });
  it('retains both occurrences of a repeated terminal and reports current scope conflicts', () => {
    const context = fixture();
    const rows = required(context.tables['stop_times.txt']);
    rows.push({
      ...required(rows[0]),
      stop_sequence: '3',
      arrival_time: '08:04:00',
      departure_time: '08:04:00',
    });
    required(context.topology.services[0]?.revisions[0]).stations.push({
      stationId: 'S',
      displayCode: 'NS1',
    });
    required(context.topology.stations[0]?.platforms[0]).serviceIds = ['OTHER'];
    const report = buildScopedReviewBlockers(context, draftFor(context));
    const candidate = required(report.patterns[0]?.candidateEvidence[0]);
    expect(candidate.platformConflicts).toEqual([0, 2]);
    expect(
      candidate.occurrences.map((item) => ({
        stopId: item.stopId,
        role: item.role,
      })),
    ).toEqual([
      { stopId: 'P', role: 'initial' },
      { stopId: 'Q', role: 'intermediate' },
      { stopId: 'P', role: 'final' },
    ]);
    expect(report.patterns[0]?.dateScopes[0]?.codes).toContain(
      'current-platform-diagnostics',
    );
    expect(
      report.countsByCode['current-platform-diagnostics']?.patternDateCount,
    ).toBe(3);
  });
  it('marks a single occurrence as both initial and final without inventing a boarding conflict', () => {
    const context = fixture();
    context.tables['stop_times.txt'] = [
      required(context.tables['stop_times.txt']?.[0]),
    ];
    required(context.topology.stations[0]?.platforms[0]).boardingStatus =
      'alighting_only';
    const report = buildScopedReviewBlockers(
      context,
      unresolvedPattern(context),
    );
    expect(report.patterns[0]?.candidateEvidence[0]).toMatchObject({
      boardingConflicts: [],
      occurrences: [{ stopId: 'P', role: 'initial-and-final' }],
    });
    expect(
      report.patterns[0]?.dateScopes[0]?.candidates[0]
        ?.currentPlatformDiagnosticsPass,
    ).toBe(true);
    expect(report.patterns[0]?.dateScopes[0]?.codes).toEqual([
      'review-required',
    ]);
  });
  it('separates all-member group conflicts from an at-least-one option pass', () => {
    const context = fixture(),
      station = required(context.topology.stations[0]);
    required(
      context.tables['stops.txt']?.find((row) => row.stop_id === 'P'),
    ).platform_code = 'A/C';
    station.platforms.push({
      ...required(station.platforms[0]),
      id: 'platform-C',
      label: 'C',
      boardingStatus: 'not_in_service',
    });
    const report = buildScopedReviewBlockers(context, draftFor(context));
    expect(report.patterns[0]?.dateScopes[0]?.codes).toEqual([
      'group-member-diagnostics',
    ]);
    expect(report.patterns[0]?.dateScopes[0]?.candidates[0]).toMatchObject({
      currentPlatformDiagnosticsPass: true,
      groupedMemberDiagnosticsPass: false,
    });
    expect(
      report.patterns[0]?.candidateEvidence[0]?.occurrences[0]?.representedGroup
        ?.platformIds,
    ).toEqual(['platform-C', 'platform-S']);
  });
  it('shows per-occurrence pickup rules for boarding conflicts', () => {
    const context = fixture();
    required(context.topology.stations[0]?.platforms[0]).boardingStatus =
      'alighting_only';
    const report = buildScopedReviewBlockers(context, draftFor(context));
    expect(report.patterns[0]?.candidateEvidence[0]).toMatchObject({
      boardingConflicts: [0],
      occurrences: [
        { index: 0, pickupDropOff: [{ pickup: '0', dropOff: '0' }] },
        { index: 1 },
      ],
    });
  });
  it('records exact operator-period failures separately from platform diagnostics', () => {
    const context = fixture();
    required(context.topology.lines[0]?.operators[0]).startedAt = '2026-01-03';
    const report = buildScopedReviewBlockers(context, draftFor(context));
    expect(report.patterns[0]?.dateScopes[0]).toMatchObject({
      serviceDates: ['2026-01-01'],
      codes: ['operator-period'],
      candidates: [
        { currentPlatformDiagnosticsPass: true, operatorPeriodMatches: false },
      ],
    });
  });
  it('retains an operator-period failure overlapping an empty temporal candidate set', () => {
    const context = fixture();
    required(context.topology.services[0]?.revisions[0]).startAt = '2026-01-03';
    required(context.topology.lines[0]?.operators[0]).startedAt = '2026-01-03';
    const report = buildScopedReviewBlockers(context, draftFor(context));
    expect(report.patterns[0]?.dateScopes).toEqual([
      expect.objectContaining({
        serviceDates: ['2026-01-01'],
        codes: ['operator-period', 'temporal-gap'],
        temporalStatus: 'gap',
        candidates: [],
      }),
    ]);
    expect(report.countsByCode['operator-period']).toEqual({
      entityCount: 0,
      patternCellCount: 1,
      patternDateCount: 1,
    });
    expect(report.countsByCode['temporal-gap']?.patternDateCount).toBe(1);
  });
  it('does not call complete unresolved manual choices diagnostic failures', () => {
    const context = fixture(),
      report = buildScopedReviewBlockers(context, unresolvedPattern(context));
    expect(report.patterns[0]?.dateScopes[0]).toMatchObject({
      codes: ['review-required'],
      serviceDates: ['2026-01-01', '2026-01-03', '2026-01-05'],
    });
    expect(report.unresolvedDecisionCount).toBe(2);
  });
  it('keeps empty-calendar unresolved cells visible without inventing dates', () => {
    const context = fixture();
    context.tables['calendar_dates.txt'] = [
      { service_id: 'C', date: '20260101', exception_type: '2' },
    ];
    const report = buildScopedReviewBlockers(
      context,
      unresolvedPattern(context),
    );
    expect(report.patterns[0]?.dateScopes[0]).toMatchObject({
      temporalStatus: 'inactive',
      codes: ['empty-calendar-review-required'],
      serviceDates: [],
    });
    expect(report.countsByCode['empty-calendar-review-required']).toEqual({
      entityCount: 0,
      patternCellCount: 1,
      patternDateCount: 0,
    });
  });
  it('distinguishes an empty unresolved cell from a genuinely inactive source calendar', () => {
    const context = fixture(),
      draft = unresolvedPattern(context);
    const pattern = required(
      draft.decisions.find((item) => item.kind === 'pattern'),
    );
    if (pattern.kind !== 'pattern') throw new Error('Missing pattern');
    pattern.dateSetId = scopedReviewDateSetId([]);
    draft.dateSets = [{ id: pattern.dateSetId, serviceDates: [] }];
    const report = buildScopedReviewBlockers(context, draft);
    expect(report.coverageComplete).toBe(false);
    expect(report.missingPatternDates[0]?.serviceDates).toEqual([
      '2026-01-01',
      '2026-01-03',
      '2026-01-05',
    ]);
    expect(report.patterns[0]?.dateScopes[0]).toMatchObject({
      temporalStatus: 'unclaimed',
      codes: ['empty-cell-review-required'],
      serviceDates: [],
    });
    expect(
      report.countsByCode['empty-calendar-review-required'],
    ).toBeUndefined();
    expect(report.countsByCode['empty-cell-review-required']).toEqual({
      entityCount: 0,
      patternCellCount: 1,
      patternDateCount: 0,
    });
  });
  it('retains static investigation causes on zero-date cells without adding dated coverage', () => {
    const context = fixture();
    context.tables['calendar_dates.txt'] = [
      { service_id: 'C', date: '20260101', exception_type: '2' },
    ];
    required(context.topology.services[0]?.revisions[0]).stations.reverse();
    context.topology.lines.push({
      id: 'TEL',
      type: 'mrt',
      serviceIds: [],
      operators: [],
    });
    draftFor(context);
    const draft = createGroupedScopedReconciliationDraft(context, {
      pilotLineIds: ['TEL'],
      preparedBy: 'Synthetic empty scope',
    });
    const report = buildScopedReviewBlockers(context, draft);
    expect(report.patterns[0]?.dateScopes[0]?.codes).toEqual([
      'empty-calendar-review-required',
      'no-path-candidate',
      'outside-pilot',
      'unmatched-dependency',
    ]);
    for (const code of [
      'no-path-candidate',
      'outside-pilot',
      'unmatched-dependency',
    ])
      expect(report.countsByCode[code]).toMatchObject({
        patternCellCount: 1,
        patternDateCount: 0,
      });
    expect(report.unresolvedPatternDateCount).toBe(0);
  });
  it('identifies deliberately outside-pilot scope without implying a source defect', () => {
    const context = fixture();
    context.topology.lines.push({
      id: 'TEL',
      type: 'mrt',
      serviceIds: [],
      operators: [],
    });
    draftFor(context);
    const draft = createGroupedScopedReconciliationDraft(context, {
      pilotLineIds: ['TEL'],
      preparedBy: 'Synthetic outside pilot',
    });
    const report = buildScopedReviewBlockers(context, draft);
    expect(
      report.entities.find((item) => item.providerId === 'NSL_TEST')?.codes,
    ).toEqual(['outside-pilot', 'unmatched-dependency']);
    expect(report.patterns[0]?.dateScopes[0]?.codes).toEqual([
      'outside-pilot',
      'unmatched-dependency',
    ]);
    expect(
      report.patterns[0]?.dateScopes[0]?.candidates[0]?.operatorPeriodMatches,
    ).toBeNull();
    expect(report.countsByCode['outside-pilot']?.patternDateCount).toBe(3);
  });
  it('reports missing subset coverage separately from explicit unresolved decisions', () => {
    const context = fixture(),
      draft = draftFor(context);
    draft.decisions = draft.decisions.filter(
      (item) => item.disposition === 'matched',
    );
    const report = buildScopedReviewBlockers(context, draft);
    expect(report).toMatchObject({
      coverageComplete: false,
      missingEntries: ['agency:LTA'],
      unresolvedDecisionCount: 0,
      entities: [],
      patterns: [],
      generationEligible: false,
    });
    draft.decisions = draft.decisions.filter((item) => item.kind !== 'pattern');
    draft.dateSets = [];
    expect(
      buildScopedReviewBlockers(context, draft).missingPatternDates[0]
        ?.serviceDates,
    ).toEqual(['2026-01-01', '2026-01-03', '2026-01-05']);
  });
  it('produces identical reports after unordered draft input changes and binds proposal text', () => {
    const context = fixture(),
      draft = unresolvedPattern(context),
      original = buildScopedReviewBlockers(context, draft);
    draft.decisions.reverse();
    draft.dateSets.reverse();
    for (const set of draft.dateSets) set.serviceDates.reverse();
    expect(JSON.stringify(buildScopedReviewBlockers(context, draft))).toBe(
      JSON.stringify(original),
    );
    required(draft.decisions[0]).reason += ' changed';
    expect(buildScopedReviewBlockers(context, draft).draftSha256).not.toBe(
      original.draftSha256,
    );
  });
  it('rejects invalid identities, source records, overlapping dates and stale date-set hashes', () => {
    const context = fixture();
    const changed = unresolvedPattern(context);
    changed.identity.canonicalCommit = 'd'.repeat(40);
    expect(() => buildScopedReviewBlockers(context, changed)).toThrow(
      'Invalid mapping draft',
    );
    const source = unresolvedPattern(context);
    required(source.decisions[0]).sourceRecordSha256 = 'd'.repeat(64);
    expect(() => buildScopedReviewBlockers(context, source)).toThrow(
      'Invalid mapping draft',
    );
    const overlap = unresolvedPattern(context),
      pattern = required(
        overlap.decisions.find((item) => item.kind === 'pattern'),
      );
    overlap.decisions.push({ ...pattern });
    expect(() => buildScopedReviewBlockers(context, overlap)).toThrow(
      'Invalid mapping draft',
    );
    const dates = unresolvedPattern(context);
    required(dates.dateSets[0]).serviceDates.push('2026-01-02');
    expect(() => buildScopedReviewBlockers(context, dates)).toThrow(
      'Invalid mapping draft',
    );
    expect(scopedReviewDateSetId(['2026-01-01'])).not.toBe(
      required(dates.dateSets[0]).id,
    );
  });
});
