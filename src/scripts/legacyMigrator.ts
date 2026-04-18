import 'dotenv/config';

import fs from 'node:fs';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { ulid } from 'ulid';
import { computeImpactFromEvidenceClaims } from '../helpers/computeImpactFromEvidenceClaims.js';
import { IssueModel } from '../legacy/model/IssueModel.js';
import { extractClaimsFromNewEvidence } from '../llm/functions/extractClaimsFromNewEvidence/index.js';
import { translate } from '../llm/functions/translate/index.js';
import { FileStore } from '../repo/common/FileStore.js';
import { deriveCurrentState } from '../repo/issue/helpers/deriveCurrentState.js';
import { MRTDownRepository } from '../repo/MRTDownRepository.js';
import type { Evidence, EvidenceRender } from '../schema/issue/evidence.js';
import type { ImpactEvent } from '../schema/issue/impactEvent.js';
import type { Issue } from '../schema/issue/issue.js';
import { assert } from '../util/assert.js';
import { buildContext, validateIssue } from '../validators/index.js';
import { FileWriteStore } from '../write/common/FileWriteStore.js';
import { MRTDownWriter } from '../write/MRTDownWriter.js';

// const stations = StationModel.getAll();

// for (const station of stations) {
//   const filePathStation = `./next/data/station/${station.id}.json`;

//   const stationV2: Station = {
//     id: station.id,
//     name: {
//       en: station.name,
//       'zh-Hans': station.name_translations['zh-Hans'] ?? null,
//       ms: station.name_translations.ms ?? null,
//       ta: station.name_translations.ta ?? null,
//     },
//     geo: station.geo,
//     stationCodes: Object.entries(station.lineMembers).flatMap(
//       ([lineId, memberships]) =>
//         memberships.map((membership) => ({
//           lineId,
//           code: membership.code,
//           startedAt: membership.startedAt,
//           endedAt: membership.endedAt ?? null,
//           structureType: membership.structureType,
//         })),
//     ),
//     landmarkIds: station.landmarks.map((landmark) => slugify(landmark)),
//     townId: slugify(station.town),
//   };

//   fs.writeFileSync(filePathStation, JSON.stringify(stationV2, null, 2));

//   const filePathTown = `./next/data/town/${slugify(station.town)}.json`;
//   const town: Town = {
//     id: slugify(station.town),
//     name: {
//       en: station.town,
//       'zh-Hans': station.town_translations['zh-Hans'] ?? null,
//       ms: station.town_translations.ms ?? null,
//       ta: station.town_translations.ta ?? null,
//     },
//   };
//   fs.writeFileSync(filePathTown, JSON.stringify(town, null, 2));

//   for (const [index, landmarkName] of station.landmarks.entries()) {
//     const filePathLandmark = `./next/data/landmark/${slugify(landmarkName)}.json`;
//     const landmarkV2: Landmark = {
//       id: slugify(landmarkName),
//       name: {
//         en: landmarkName,
//         'zh-Hans': station.landmarks_translations['zh-Hans'][index],
//         ms: station.landmarks_translations.ms[index] ?? null,
//         ta: station.landmarks_translations.ta[index] ?? null,
//       },
//     };
//     fs.writeFileSync(filePathLandmark, JSON.stringify(landmarkV2, null, 2));
//   }
// }

const issues = IssueModel.getAll();
const gpt5Cutoff = DateTime.fromISO('2025-10-16T18:53:19+08:00');

const DATA_DIR = join(import.meta.dirname, 'data');
const MIGRATED_IDS_PATH = 'migrated-legacy-ids.json';

function loadMigratedIds(): Set<string> {
  try {
    const raw = fs.readFileSync(MIGRATED_IDS_PATH, 'utf-8');
    const ids = JSON.parse(raw) as string[];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

function saveMigratedId(id: string): void {
  const current = loadMigratedIds();
  current.add(id);
  const sorted = [...current].sort();
  fs.writeFileSync(MIGRATED_IDS_PATH, JSON.stringify(sorted, null, 2), 'utf-8');
}

const fileStore = new FileStore(DATA_DIR);
const writeStore = new FileWriteStore(DATA_DIR);

const repo = new MRTDownRepository({ store: fileStore });
const writer = new MRTDownWriter({ store: writeStore });

const layouter = (msg: string) => `\x1b[36m[layouter] ${msg}\x1b[0m`;

const args = process.argv.slice(2);
const startIndex = args.includes('--start')
  ? Number.parseInt(args[args.indexOf('--start') + 1], 10)
  : 0;
const endIndex = args.includes('--end')
  ? Number.parseInt(args[args.indexOf('--end') + 1], 10)
  : issues.length - 1;

const migratedIds = loadMigratedIds();
console.log(
  layouter(
    `Loaded ${migratedIds.size} migrated IDs, processing issues ${startIndex}–${endIndex} (of ${issues.length - 1})`,
  ),
);

for (const [i, legacyIssue] of issues.entries()) {
  if (i < startIndex || i > endIndex) continue;
  if (migratedIds.has(legacyIssue.id)) {
    console.log(layouter(`Skipping already migrated: ${legacyIssue.id}`));
    continue;
  }

  console.log(
    layouter(`Processing issue ${i}: ${legacyIssue.id}: ${legacyIssue.title}`),
  );

  const startAt = DateTime.fromISO(legacyIssue.startAt);
  assert(startAt.isValid, `Invalid date: ${legacyIssue.startAt}`);

  const folderPath = join(
    DATA_DIR,
    'issue',
    startAt.toFormat('yyyy'),
    startAt.toFormat('MM'),
    legacyIssue.id,
  );

  if (fs.existsSync(folderPath)) {
    console.log(layouter(`Cleaning existing dir for issue ${legacyIssue.id}`));
    fs.rmSync(folderPath, { recursive: true });
  }

  fs.mkdirSync(folderPath, { recursive: true });

  const issue: Issue = {
    id: legacyIssue.id,
    type: legacyIssue.type,
    title: {
      'en-SG': legacyIssue.title,
      ...legacyIssue.title_translations,
    },
    titleMeta: {
      source:
        startAt > gpt5Cutoff ? '@openai/gpt-5-mini' : '@openai/gpt-4-mini',
    },
  };

  writer.issues.create(issue);

  const evidences: Evidence[] = [];
  const impacts: ImpactEvent[] = [];

  // Reverse the updates to process the earliest updates first.
  legacyIssue.updates.reverse();

  /**
   * Process all the updates into evidences first.
   */

  for (const update of legacyIssue.updates) {
    const createdAt = DateTime.fromISO(update.createdAt);
    assert(createdAt.isValid, `Invalid date: ${update.createdAt}`);

    const render: EvidenceRender = {
      text: await translate(update.text),
      source: '@openai/gpt-5-nano',
    };
    console.log(layouter('Evidence render:'), render);

    let type: Evidence['type'];
    switch (update.type) {
      case 'operator.update':
      case 'operator.investigating':
      case 'operator.monitoring':
      case 'operator.resolved':
      case 'planned':
        type = 'official-statement';
        break;
      case 'general-public.report':
        type = 'public.report';
        break;
      case 'news.report':
        type = 'media.report';
        break;
    }

    const evidence: Evidence = {
      id: `ev_${ulid(createdAt.toMillis())}`,
      ts: createdAt.toISO({ includeOffset: true }),
      type,
      text: update.text,
      sourceUrl: update.sourceUrl,
      render,
    };

    const currentState = deriveCurrentState({
      issue,
      evidence: evidences,
      impactEvents: impacts,
      path: folderPath,
    });
    console.log(layouter('Current state before evidence:'));
    console.dir(currentState, { depth: null });

    const ts = DateTime.fromISO(evidence.ts);
    assert(ts.isValid, `Invalid date: ${evidence.ts}`);

    console.log(layouter('Extracting claims from evidence...'));
    const { claims } = await extractClaimsFromNewEvidence({
      newEvidence: {
        ts: evidence.ts,
        text: evidence.text,
      },
      repo,
    });

    console.log(layouter('Claims:'));
    console.dir(claims, { depth: null });

    const { newImpactEvents } = computeImpactFromEvidenceClaims({
      issueBundle: {
        issue,
        evidence: [...evidences, evidence],
        impactEvents: impacts,
        path: folderPath,
      },
      evidenceId: evidence.id,
      evidenceTs: evidence.ts,
      claims,
    });

    // const evidenceImpacts: ImpactEvent[] = [];

    // if (effects.length > 0) {
    //   evidenceImpacts.push({
    //     type: 'effects.set',
    //     ts: ts.toISO(),
    //     basis: { evidenceIds: [evidence.id] },
    //     effects,
    //   });
    // }

    // if (scopes.length > 0) {
    //   evidenceImpacts.push({
    //     type: 'scopes.set',
    //     ts: ts.toISO(),
    //     basis: { evidenceIds: [evidence.id] },
    //     scopeItems: scopes,
    //   });
    // }

    // if (periods.length > 0) {
    //   evidenceImpacts.push({
    //     type: 'periods.set',
    //     ts: ts.toISO(),
    //     basis: { evidenceIds: [evidence.id] },
    //     periods,
    //   });
    // }

    console.log(layouter('Evidence impacts:'));
    console.dir({ evidence, impacts: newImpactEvents }, { depth: null });

    impacts.push(...newImpactEvents);
    evidences.push(evidence);

    writer.issues.appendEvidence(issue.id, evidence);
    for (const impact of newImpactEvents) {
      writer.issues.appendImpact(issue.id, impact);
    }
  }

  // /**
  //  * Create impacts
  //  */

  // // Create the initial periods_set impact

  // switch (issue.type) {
  //   case 'disruption': {
  //     impacts.push({
  //       type: 'periods_set',
  //       ts: startAt.toISO(),
  //       basis: { evidenceIds: [evidences[0].id] },
  //       periods: [
  //         {
  //           id: `pr_${ulid(startAt.toMillis())}`,
  //           startAt: startAt.toISO({ includeOffset: true }),
  //           endAt: null,
  //           cancelled: null,
  //         },
  //       ],
  //     });
  //     break;
  //   }
  //   case 'maintenance':
  //   case 'infra': {
  //     const intervals = computeIssueIntervals(issue);

  //     const periods: Period[] = [];
  //     for (const interval of intervals) {
  //       const { start, end } = interval;
  //       assert(start != null);
  //       periods.push({
  //         id: `pr_${ulid(start.toMillis())}`,
  //         startAt: start.toISO(),
  //         endAt: end?.toISO?.() ?? null,
  //         cancelled: null,
  //       });
  //     }

  //     impacts.push({
  //       type: 'periods_set',
  //       ts: startAt.toISO(),
  //       basis: { evidenceIds: [evidences[0].id] },
  //       periods,
  //     });
  //     break;
  //   }
  // }

  console.log(layouter('Final current state:'));
  console.dir(
    deriveCurrentState({
      issue,
      evidence: evidences,
      impactEvents: impacts,
      path: folderPath,
    }),
    { depth: null },
  );

  const relBase = join(
    'issue',
    startAt.toFormat('yyyy'),
    startAt.toFormat('MM'),
    legacyIssue.id,
  );
  const ctx = buildContext(fileStore);
  const validationErrors = validateIssue(fileStore, relBase, ctx);
  if (validationErrors.length > 0) {
    console.error(layouter(`Validation errors for ${legacyIssue.id}:`));
    for (const err of validationErrors) {
      const loc = err.line ? `${err.file}:${err.line}` : err.file;
      console.error(`  ${loc}: ${err.message}`);
    }
    process.exit(1);
  }
  saveMigratedId(legacyIssue.id);
  console.log(layouter(`Validated ${legacyIssue.id} OK`));
}
