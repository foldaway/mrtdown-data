import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { acquirePublicGtfsCapture } from '../packages/cli/dist/gtfsAcquisition.js';
import {
  auditSchedule,
  readSchedule,
} from '../packages/fs/dist/gtfs/schedule.js';
import {
  activeServiceDates,
  compareScheduleSnapshots,
  readVerifiedCapture,
} from '../packages/fs/dist/index.js';
import {
  compareJourneySchedules,
  renderJourneyChanges,
} from './gtfs-schedule-changes.mjs';

const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const message = (error) =>
  error instanceof Error ? error.message : String(error);
// Feed cells are untrusted text, including in Markdown tables and PR descriptions.
const cell = (value) =>
  String(value)
    .slice(0, 400)
    .replace(/[&<>|`[\]\\*_]/g, (character) => `&#${character.charCodeAt(0)};`)
    .replace(/[\r\n\t]/g, ' ');

export function validateBaseline(value) {
  if (
    value?.schemaVersion !== 1 ||
    typeof value.captureKey !== 'string' ||
    !/^captures\/schedule\/[a-f0-9]{64}\.json$/.test(value.captureKey ?? '') ||
    typeof value.evidence?.description !== 'string' ||
    !value.evidence.description
  ) {
    throw new Error('Invalid explicit GTFS comparison baseline');
  }
  return value;
}

export function dateRanges(dates) {
  const ranges = [];
  for (const date of [...new Set(dates)].sort()) {
    const last = ranges.at(-1);
    if (
      last &&
      Date.parse(`${date}T00:00:00Z`) -
        Date.parse(`${last.endDate}T00:00:00Z`) ===
        86_400_000
    ) {
      last.endDate = date;
    } else ranges.push({ startDate: date, endDate: date });
  }
  return ranges;
}

export function serviceCoverage(tables) {
  // Ignore calendar rows that are not referenced by any trip. Exceptions override weekdays.
  const serviceIds = [
    ...new Set((tables['trips.txt'] ?? []).map((trip) => trip.service_id)),
  ].sort();
  const services = serviceIds.map((serviceId) => {
    const dates = activeServiceDates(tables, serviceId);
    return { serviceId, dates, count: dates.length, ranges: dateRanges(dates) };
  });
  const dates = [
    ...new Set(services.flatMap((service) => service.dates)),
  ].sort();
  return {
    dates,
    count: dates.length,
    ranges: dateRanges(dates),
    services,
  };
}

export function compareCoverage(before, after) {
  const previous = new Set(before.dates);
  const next = new Set(after.dates);
  const summarize = (dates) => ({
    count: dates.length,
    ranges: dateRanges(dates),
  });
  const previousServices = new Map(
    before.services.map((service) => [service.serviceId, service]),
  );
  const nextServices = new Map(
    after.services.map((service) => [service.serviceId, service]),
  );
  const services = [
    ...new Set([...previousServices.keys(), ...nextServices.keys()]),
  ]
    .sort()
    .map((serviceId) => {
      const previousDates = new Set(
        previousServices.get(serviceId)?.dates ?? [],
      );
      const nextDates = new Set(nextServices.get(serviceId)?.dates ?? []);
      return {
        serviceId,
        added: summarize(
          [...nextDates].filter((date) => !previousDates.has(date)),
        ),
        removed: summarize(
          [...previousDates].filter((date) => !nextDates.has(date)),
        ),
      };
    });
  return {
    added: summarize(after.dates.filter((date) => !previous.has(date))),
    removed: summarize(before.dates.filter((date) => !next.has(date))),
    shared: summarize(after.dates.filter((date) => previous.has(date))),
    services,
  };
}

export async function independentFindings(directory, sha256, outcome) {
  try {
    const invocation = await json(join(directory, 'invocation.json'));
    if (invocation.inputSha256 !== sha256)
      throw new Error('Validator provenance does not match this capture');
    const report = await json(join(directory, 'report.json'));
    const system = await json(join(directory, 'system_errors.json'));
    if (!Array.isArray(report.notices) || !Array.isArray(system.notices))
      throw new Error('Unexpected validator report format');
    const notices = report.notices
      .map((notice) => {
        if (
          typeof notice.code !== 'string' ||
          typeof notice.severity !== 'string' ||
          !Number.isSafeInteger(notice.totalNotices) ||
          notice.totalNotices < 0
        ) {
          throw new Error('Unexpected validator notice format');
        }
        return {
          code: notice.code,
          severity: notice.severity,
          count: notice.totalNotices,
          examples: (notice.sampleNotices ?? [])
            .slice(0, 2)
            .map((sample) => JSON.stringify(sample).slice(0, 400)),
        };
      })
      .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    const totals = {};
    for (const notice of notices)
      totals[notice.severity] = (totals[notice.severity] ?? 0) + notice.count;
    return {
      status: 'available',
      outcome,
      validator: invocation.validator,
      validationDate: report.summary?.dateForValidation ?? null,
      stage: invocation.stage,
      executionError: invocation.executionError,
      systemErrorCount: system.notices.length,
      totals,
      notices,
    };
  } catch (error) {
    return { status: 'unavailable', outcome, reason: message(error) };
  }
}

function inspect(bytes) {
  const input = readSchedule(bytes);
  const audit = auditSchedule(input.tables);
  let coverage;
  try {
    if (audit.structuralErrors.length)
      throw new Error(
        'Structurally invalid feed; service dates cannot be assessed',
      );
    coverage = { status: 'available', ...serviceCoverage(input.tables) };
  } catch (error) {
    coverage = { status: 'unavailable', reason: message(error) };
  }
  return {
    input,
    summary: {
      tableCounts: audit.tableCounts,
      feedInfo: audit.feedInfo,
      structuralErrors: audit.structuralErrors,
      coverage,
    },
  };
}

const rangeText = (summary) =>
  summary.ranges
    .slice(0, 8)
    .map((range) =>
      range.startDate === range.endDate
        ? range.startDate
        : `${range.startDate}–${range.endDate}`,
    )
    .join(', ') + (summary.ranges.length > 8 ? ' (more ranges in JSON)' : '');

export function renderReview(report) {
  const lines = [
    '# LTA train GTFS snapshot',
    '',
    ...renderJourneyChanges(report.comparison.journeys, cell),
    '## Capture and comparison evidence',
    '',
    `- Retrieved at ${cell(report.capture.retrieved_at)}`,
    `- ZIP SHA-256 \`${report.capture.sha256}\``,
    `- [Capture receipt](${report.origin}/captures/schedule/${report.capture.sha256}.json) and [source ZIP](${report.origin}/${report.capture.archive_ref})`,
    `- Canonical repository commit \`${report.canonicalCommit}\` (context only; mappings have not been reassessed)`,
    `- Independent validator step: ${cell(report.validation.outcome)}; MRTDown inspection step: ${cell(report.inspectionOutcome)}`,
  ];
  if (report.runUrl) lines.push(`- [GitHub Actions run](${report.runUrl})`);
  if (report.artifactUrl)
    lines.push(
      `- [Download full reports](${report.artifactUrl}) (subject to artifact retention)`,
    );
  lines.push('', '## Changes from the explicit baseline', '');
  if (report.baseline.definition) {
    const definition = report.baseline.definition;
    lines.push(
      `Baseline: [${definition.captureKey.split('/').at(-1).slice(0, 12)}](${report.origin}/${definition.captureKey}). ${cell(definition.evidence.description)}`,
      '',
    );
  }
  if (report.comparison.status === 'available') {
    const tables = report.comparison.drift.tables;
    const changed = tables.filter(
      (table) => table.added || table.removed || table.changed,
    );
    lines.push(
      changed.length
        ? `${changed.length} table(s) have normalized content changes.`
        : 'No normalized table content changes from the baseline.',
      '',
      '| Table | Before | After | Added | Removed | Changed IDs |',
      '| --- | ---: | ---: | ---: | ---: | ---: |',
    );
    for (const table of tables)
      lines.push(
        `| ${cell(table.name)} | ${table.beforeCount} | ${table.afterCount} | ${table.added} | ${table.removed} | ${table.changed} |`,
      );
    lines.push(
      '',
      'Counts use provider IDs (stop times use trip + sequence). Added/removed IDs can reflect renumbering and do not establish added/removed train services. Row order and limited numeric/time formatting differences are ignored.',
      '',
    );
    for (const table of changed) {
      const fields = Object.entries(table.fieldChanges)
        .map(([field, count]) => `${field}: ${count}`)
        .join(', ');
      if (fields)
        lines.push(`- ${cell(table.name)} changed fields: ${cell(fields)}`);
      for (const example of table.changedExamples.slice(0, 3))
        lines.push(
          `  - ID ${cell(JSON.stringify(example.key))}: ${cell(example.fields.join(', '))}`,
        );
    }
  } else
    lines.push(`**Comparison unavailable:** ${cell(report.comparison.reason)}`);
  lines.push(
    '',
    '## Service-date coverage',
    '',
    'These are source-calendar dates referenced by trips, including additions/removals from calendar exceptions. They are separate from approved timetable coverage and do not infer public-holiday policy.',
    '',
  );
  for (const [label, summary] of [
    ['Candidate', report.current],
    ['Baseline', report.baseline.summary],
  ]) {
    if (!summary) continue;
    const coverage = summary.coverage;
    lines.push(
      coverage.status === 'available'
        ? `- ${label}: ${coverage.count} active dates; ${rangeText(coverage) || 'none'}.`
        : `- ${label}: unavailable — ${cell(coverage.reason)}`,
    );
  }
  if (report.comparison.coverage) {
    for (const key of ['added', 'removed', 'shared']) {
      const coverage = report.comparison.coverage[key];
      lines.push(
        `- ${key}: ${coverage.count} dates${coverage.count ? `; ${rangeText(coverage)}` : ''}.`,
      );
    }
  }
  if (report.current?.coverage.status === 'available') {
    const previous = new Map(
      (report.baseline.summary?.coverage.services ?? []).map((service) => [
        service.serviceId,
        service,
      ]),
    );
    const next = new Map(
      report.current.coverage.services.map((service) => [
        service.serviceId,
        service,
      ]),
    );
    const ids = [...new Set([...previous.keys(), ...next.keys()])].sort();
    lines.push(
      '',
      'Calendar details (referenced by trips):',
      '',
      '| Service ID | Baseline active dates | Candidate active dates | Added dates | Removed dates |',
      '| --- | ---: | ---: | --- | --- |',
    );
    for (const id of ids.slice(0, 12)) {
      const service = next.get(id);
      const beforeCount =
        report.baseline.summary?.coverage.status === 'available'
          ? (previous.get(id)?.count ?? 0)
          : 'unavailable';
      const change = report.comparison.coverage?.services.find(
        (item) => item.serviceId === id,
      );
      lines.push(
        `| ${cell(id)} | ${beforeCount} | ${service?.count ?? 0} | ${change ? rangeText(change.added) || 'none' : 'unavailable'} | ${change ? rangeText(change.removed) || 'none' : 'unavailable'} |`,
      );
    }
    if (ids.length > 12)
      lines.push('', 'Additional calendars are retained in JSON evidence.');
  }
  lines.push('', '## Validation findings', '');
  if (report.current) {
    const errors = report.current.structuralErrors;
    lines.push(`MRTDown structural errors: ${errors.length}.`);
    for (const error of errors.slice(0, 10)) lines.push(`- ${cell(error)}`);
  } else lines.push(`MRTDown report unavailable: ${cell(report.currentError)}`);
  const validation = report.validation;
  if (validation.status === 'available') {
    lines.push(
      '',
      `Validator version: ${cell(validation.validator?.version ?? 'unknown')}; fixed validation date: ${cell(validation.validationDate ?? 'unknown')}.`,
    );
    lines.push(
      '',
      `Independent validator: ${
        Object.entries(validation.totals)
          .map(([severity, count]) => `${cell(severity)} ${count}`)
          .join(', ') || 'no notices'
      }; system errors ${validation.systemErrorCount}.`,
      '',
      '| Code | Severity | Occurrences |',
      '| --- | --- | ---: |',
    );
    for (const notice of validation.notices.slice(0, 20))
      lines.push(
        `| ${cell(notice.code)} | ${cell(notice.severity)} | ${notice.count} |`,
      );
    if (validation.notices.length > 20)
      lines.push(
        '',
        'Additional notice categories are retained in the JSON evidence.',
      );
    if (validation.executionError)
      lines.push('', `Execution finding: ${cell(validation.executionError)}`);
  } else
    lines.push(
      '',
      `Independent findings unavailable: ${cell(validation.reason)}`,
    );
  lines.push(
    '',
    '## Review decisions',
    '',
    '- [ ] Assess the table changes and provider ID churn against the stated baseline.',
    '- [ ] Assess service dates and validation findings; investigate missing evidence.',
    '- [ ] Review mapping impact separately, including platform, pattern, and holiday policy changes. Existing approvals have not been verified against this capture.',
    '- [ ] If accepting this source as the next comparison baseline, update baseline.json explicitly in a reviewed change.',
    '',
    'When a prepared publication request is committed beside this record, merging the PR authorizes deployment of that exact release. Without a publication request, merging retains evidence only; mapping approval and timetable publication require the exception release procedure. The comparison baseline remains an explicit separate update. Compact JSON evidence is committed beside this record; detailed reports remain linked above.',
    '',
  );
  return lines.join('\n');
}

export async function buildSnapshotReview(options) {
  // A rerun must not overwrite evidence or reuse a partially acquired baseline.
  await mkdir(options.outputDir);
  const { capture, bytes } = await readVerifiedCapture(
    join(options.inputDir, 'schedule.zip'),
    join(options.inputDir, 'capture.json'),
  );
  if (capture.feed_kind !== 'schedule')
    throw new Error('Expected schedule capture');
  const origin = new URL(options.origin);
  if (
    origin.protocol !== 'https:' ||
    origin.pathname !== '/' ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  )
    throw new Error('Expected trusted HTTPS snapshot origin');
  const report = {
    schemaVersion: 1,
    capture,
    origin: origin.origin,
    canonicalCommit: options.canonicalCommit,
    runUrl: options.runUrl ?? '',
    artifactUrl: options.artifactUrl ?? '',
    inspectionOutcome: options.inspectionOutcome,
    validation: await independentFindings(
      options.independentDir,
      capture.sha256,
      options.independentOutcome,
    ),
    baseline: {},
    comparison: { status: 'unavailable', reason: 'Not assessed' },
  };
  let current;
  try {
    current = inspect(bytes);
    report.current = current.summary;
  } catch (error) {
    report.currentError = message(error);
  }
  try {
    report.baseline.definition = validateBaseline(
      await json(options.baselinePath),
    );
    const baselineDir = join(options.outputDir, 'baseline-input');
    const acquire = options.acquire ?? acquirePublicGtfsCapture;
    const files = await acquire(
      options.origin,
      report.baseline.definition.captureKey,
      baselineDir,
    );
    const verified = await readVerifiedCapture(files.file, files.handoff);
    const expectedSha256 = report.baseline.definition.captureKey
      .split('/')
      .at(-1)
      .slice(0, -5);
    if (verified.capture.sha256 !== expectedSha256)
      throw new Error('Baseline capture does not match its definition');
    const baseline = inspect(verified.bytes);
    report.baseline.summary = baseline.summary;
    if (!current) throw new Error('Candidate could not be parsed');
    report.comparison = {
      status: 'available',
      drift: compareScheduleSnapshots(baseline.input, current.input),
    };
    if (
      baseline.summary.coverage.status === 'available' &&
      current.summary.coverage.status === 'available'
    ) {
      report.comparison.coverage = compareCoverage(
        baseline.summary.coverage,
        current.summary.coverage,
      );
      try {
        report.comparison.journeys = compareJourneySchedules(
          baseline.input.tables,
          current.input.tables,
          baseline.summary.coverage,
          current.summary.coverage,
        );
      } catch (error) {
        report.comparison.journeys = {
          status: 'unavailable',
          reason: message(error),
        };
      }
    }
  } catch (error) {
    report.comparison = { status: 'unavailable', reason: message(error) };
  }
  const markdown = renderReview(report);
  const stem = capture.sha256;
  await writeFile(
    join(options.outputDir, `${stem}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(join(options.outputDir, `${stem}.md`), markdown);
  return report;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [inputDir, independentDir, outputDir] = process.argv.slice(2);
  if (!inputDir || !independentDir || !outputDir)
    throw new Error(
      'Usage: node scripts/build-gtfs-snapshot-review.mjs <input-dir> <independent-dir> <output-dir>',
    );
  const env = process.env;
  await buildSnapshotReview({
    inputDir,
    independentDir,
    outputDir,
    baselinePath: resolve('docs/gtfs/captures/baseline.json'),
    origin: env.GTFS_SNAPSHOT_BASE_URL,
    independentOutcome: env.INDEPENDENT_OUTCOME ?? 'unknown',
    inspectionOutcome: env.INSPECTION_OUTCOME ?? 'unknown',
    canonicalCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    runUrl: env.REVIEW_RUN_URL,
    artifactUrl: env.ARTIFACT_URL,
  });
}
