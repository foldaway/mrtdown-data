import 'dotenv/config';

import { drizzle } from 'drizzle-orm/node-postgres';
import { ComponentModel } from '../../model/ComponentModel';
import { componentsTable } from '../../db/schema/components';
import { componentBranchMembershipsTable } from '../../db/schema/component_branch_memberships';
import { componentBranchesTable } from '../../db/schema/component_branches';
import { StationModel } from '../../model/StationModel';
import { stationsTable } from '../../db/schema/stations';
import { townsTable } from '../../db/schema/towns';
import { landmarksTable } from '../../db/schema/landmarks';
import { generateTownId } from '../../util/generateTownId';
import { generateLandmarkId } from '../../util/generateLandmarkId';
import { generateComponentBranchId } from '../../util/generateComponentBranchId';
import { stationLandmarksTable } from '../../db/schema/station_landmarks';
import { IssueModel } from '../../model/IssueModel';
import { computeIssueIntervals } from '../../helpers/computeIssueIntervals';
import { issuesTable } from '../../db/schema/issues';
import { issueIntervalsTable } from '../../db/schema/issue_intervals';
import { assert } from '../../util/assert';
import { issueUpdatesTable } from '../../db/schema/issue_updates';
import { issueSubtypesTable } from '../../db/schema/issue_subtypes';
import {
  IssueDisruptionSubtypeSchema,
  IssueInfraSubtypeSchema,
  IssueMaintenanceSubtypeSchema,
} from '../../schema/Issue';
import { issueSubtypeMembershipsTable } from '../../db/schema/issue_subtype_memberships';
import { issueComponentBranchMembershipsTable } from '../../db/schema/issue_component_branch_memberships';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { generateHash } from './helpers/generateHash';
import type { Town } from '../../schema/Town';
import type { Landmark } from '../../schema/Landmark';
import { from as copyFrom } from 'pg-copy-streams';
import { stringify } from 'csv-stringify/sync';

/**
 * This script ingests the JSON data into a live Postgres database.
 */

const { DATABASE_URL } = process.env;
assert(DATABASE_URL != null, 'Expected DATABASE_URL env var');

const db = drizzle(DATABASE_URL);

const stations = StationModel.getAll();
const stationsByCode = new Map(
  stations.flatMap((station) => {
    const stationCodes = new Set<string>();
    for (const members of Object.values(station.componentMembers)) {
      for (const member of members) {
        stationCodes.add(member.code);
      }
    }
    return Array.from(stationCodes).map((stationCode) => {
      return [stationCode, station];
    });
  }),
);

// Write all issue subtypes to the database
for (const subtype of Object.values(IssueDisruptionSubtypeSchema.enum)) {
  await db
    .insert(issueSubtypesTable)
    .values({ type: subtype })
    .onConflictDoNothing();
}
for (const subtype of Object.values(IssueMaintenanceSubtypeSchema.enum)) {
  await db
    .insert(issueSubtypesTable)
    .values({ type: subtype })
    .onConflictDoNothing();
}
for (const subtype of Object.values(IssueInfraSubtypeSchema.enum)) {
  await db
    .insert(issueSubtypesTable)
    .values({ type: subtype })
    .onConflictDoNothing();
}

const towns = new Map<string, Town>();
const landmarks = new Map<string, Landmark>();

/**
 * Pick out town and landmark entities.
 * Note that this is temporary while they are not separate entities from the stations.
 */
for (const station of stations) {
  const townId = generateTownId(station.town);
  towns.set(townId, {
    id: townId,
    title: station.town,
    title_translations: {
      'zh-Hans': station.town_translations['zh-Hans'],
      ms: station.town_translations.ms,
      ta: station.town_translations.ta,
    },
  });

  for (const [index, landmark] of station.landmarks.entries()) {
    const landmarkId = generateLandmarkId(landmark);
    landmarks.set(landmarkId, {
      id: landmarkId,
      title: landmark,
      title_translations: {
        'zh-Hans': station.landmarks_translations['zh-Hans'][index],
        ms: station.landmarks_translations.ms[index],
        ta: station.landmarks_translations.ta[index],
      },
    });
  }
}

// Just use standard Drizzle upsert as there are less than 100 towns.
console.log(`Processing ${towns.size} towns`);
await db.transaction(async (tx) => {
  await tx
    .insert(townsTable)
    .values(
      Array.from(towns.values()).map((town) => {
        return {
          id: town.id,
          title: town.title,
          'title_zh-Hans': town.title_translations['zh-Hans'],
          title_ms: town.title_translations.ms,
          title_ta: town.title_translations.ta,
        };
      }),
    )
    .onConflictDoUpdate({
      target: townsTable.id,
      set: {
        title: sql`excluded.title`,
        'title_zh-Hans': sql`excluded."title_zh-Hans"`,
        title_ms: sql`excluded.title_ms`,
        title_ta: sql`excluded.title_ta`,
      },
    });

  // Prune towns that are no longer in the data.
  const townDeletionQuery = await tx
    .delete(townsTable)
    .where(notInArray(townsTable.id, Array.from(towns.keys())));
  console.log(`Pruned ${townDeletionQuery.rowCount} towns`);
});

// Just use standard Drizzle upsert as there are less than 500 landmarks.
console.log(`Processing ${landmarks.size} landmarks`);
await db.transaction(async (tx) => {
  await tx
    .insert(landmarksTable)
    .values(
      Array.from(landmarks.values()).map((landmark) => {
        return {
          id: landmark.id,
          title: landmark.title,
          'title_zh-Hans': landmark.title_translations['zh-Hans'],
          title_ms: landmark.title_translations.ms,
          title_ta: landmark.title_translations.ta,
        };
      }),
    )
    .onConflictDoUpdate({
      target: landmarksTable.id,
      set: {
        title: sql`excluded.title`,
        'title_zh-Hans': sql`excluded."title_zh-Hans"`,
        title_ms: sql`excluded.title_ms`,
        title_ta: sql`excluded.title_ta`,
      },
    });

  // Prune landmarks that are no longer in the data.
  const landmarkDeletionQuery = await tx
    .delete(landmarksTable)
    .where(notInArray(landmarksTable.id, Array.from(landmarks.keys())));
  console.log(`Pruned ${landmarkDeletionQuery.rowCount} landmarks`);
});

console.log(`Processing ${stations.length} stations`);
await db.transaction(async (tx) => {
  await tx
    .insert(stationsTable)
    .values(
      stations.map((station) => {
        const hash = generateHash(station);

        return {
          id: station.id,
          name: station.name,
          'name_zh-Hans': station.name_translations['zh-Hans'],
          name_ms: station.name_translations.ms,
          name_ta: station.name_translations.ta,
          lat: station.geo.latitude,
          lng: station.geo.longitude,
          town_id: generateTownId(station.town), // FIXME: to be replaced with dedicated Town entity's ID reference
          hash,
        };
      }),
    )
    .onConflictDoUpdate({
      target: stationsTable.id,
      set: {
        name: sql`excluded.name`,
        'name_zh-Hans': sql`excluded."name_zh-Hans"`,
        name_ms: sql`excluded.name_ms`,
        name_ta: sql`excluded.name_ta`,
        lat: sql`excluded.lat`,
        lng: sql`excluded.lng`,
        town_id: sql`excluded.town_id`,
        hash: sql`excluded.hash`,
      },
      setWhere: sql`${stationsTable.hash} IS DISTINCT FROM EXCLUDED.hash`,
    })
    .returning({
      id: stationsTable.id,
    });
  // Prune stations that are no longer in the data.
  const stationDeletionQuery = await tx.delete(stationsTable).where(
    notInArray(
      stationsTable.id,
      stations.map((station) => station.id),
    ),
  );
  console.log(`Pruned ${stationDeletionQuery.rowCount} stations`);
});

const components = ComponentModel.getAll();
console.log(`Processing ${components.length} components`);

await db.transaction(async (tx) => {
  const componentProcessedRows = await db
    .insert(componentsTable)
    .values(
      components.map((component) => {
        const hash = generateHash(component);

        return {
          id: component.id,
          title: component.title,
          'title_zh-Hans': component.title_translations['zh-Hans'],
          title_ms: component.title_translations.ms,
          title_ta: component.title_translations.ta,
          type: component.type,
          hash,
        };
      }),
    )
    .onConflictDoUpdate({
      target: componentsTable.id,
      set: {
        title: sql`excluded.title`,
        'title_zh-Hans': sql`excluded."title_zh-Hans"`,
        title_ms: sql`excluded.title_ms`,
        title_ta: sql`excluded.title_ta`,
        type: sql`excluded.type`,
        hash: sql`excluded.hash`,
      },
      setWhere: sql`${componentsTable.hash} IS DISTINCT FROM EXCLUDED.hash`,
    })
    .returning({
      id: componentsTable.id,
      inserted: sql<boolean>`xmax = 0`,
      updated: sql<boolean>`xmax <> 0 AND ${componentsTable.updated_at} = now()`,
    });
  const componentIdsThatNeedWork = new Set<string>();
  for (const componentRow of componentProcessedRows) {
    if (!componentRow.inserted && !componentRow.updated) {
      // Nothing to do, component row was already up-to-date.
      continue;
    }
    componentIdsThatNeedWork.add(componentRow.id);
  }
  // Prune all component branches for this component.
  // This also cascades to, and will delete corresponding component branch memberships.
  await tx
    .delete(componentBranchesTable)
    .where(
      inArray(
        componentBranchesTable.component_id,
        Array.from(componentIdsThatNeedWork),
      ),
    );

  type DbComponentBranchInsert = typeof componentBranchesTable.$inferInsert;
  type DbComponentBranchMembershipInsert =
    typeof componentBranchMembershipsTable.$inferInsert;

  const dbComponentBranches: DbComponentBranchInsert[] = [];
  const dbComponentBranchMemberships: DbComponentBranchMembershipInsert[] = [];

  for (const component of components) {
    if (!componentIdsThatNeedWork.has(component.id)) {
      continue;
    }

    // Write component branches
    for (const [branchCode, branch] of Object.entries(component.branches)) {
      const componentBranchId = generateComponentBranchId(
        component.id,
        branchCode,
      );

      dbComponentBranches.push({
        id: componentBranchId,
        code: branchCode,
        component_id: component.id,
        title: branch.title,
        'title_zh-Hans': branch.title_translations['zh-Hans'],
        title_ms: branch.title_translations.ms,
        title_ta: branch.title_translations.ta,
        started_at: branch.startedAt,
        ended_at: branch.endedAt ?? null,
      });
    }

    for (const [branchCode, branch] of Object.entries(component.branches)) {
      const componentBranchId = generateComponentBranchId(
        component.id,
        branchCode,
      );

      for (const [index, stationCode] of branch.stationCodes.entries()) {
        const station = stationsByCode.get(stationCode);
        if (station == null) {
          continue;
        }

        const componentMembership = station.componentMembers[component.id].find(
          (membership) => membership.code === stationCode,
        );
        if (componentMembership == null) {
          continue;
        }

        dbComponentBranchMemberships.push({
          component_branch_id: componentBranchId,
          station_id: station.id,
          code: stationCode,
          structure_type: componentMembership.structureType,
          startedAt: componentMembership.startedAt,
          endedAt: componentMembership.endedAt ?? null,
          order_index: index,
        });
      }
    }
  }

  if (componentIdsThatNeedWork.size > 0) {
    // Write component branches
    await tx.insert(componentBranchesTable).values(dbComponentBranches);

    // Write component branch memberships
    await tx
      .insert(componentBranchMembershipsTable)
      .values(dbComponentBranchMemberships);
  }
});

const issues = IssueModel.getAll();
console.log(`Processing ${issues.length} issues`);

await db.transaction(async (tx) => {
  const issueProcessedRows = await tx
    .insert(issuesTable)
    .values(
      issues.map((issue) => {
        const latestHash = generateHash(issue);

        return {
          id: issue.id,
          title: issue.title,
          'title_zh-Hans': issue.title_translations['zh-Hans'],
          title_ms: issue.title_translations.ms,
          title_ta: issue.title_translations.ta,
          type: issue.type,
          hash: latestHash,
        };
      }),
    )
    .onConflictDoUpdate({
      target: issuesTable.id,
      set: {
        title: sql`excluded.title`,
        'title_zh-Hans': sql`excluded."title_zh-Hans"`,
        title_ms: sql`excluded.title_ms`,
        title_ta: sql`excluded.title_ta`,
        type: sql`excluded.type`,
        hash: sql`excluded.hash`,
      },
      setWhere: sql`${issuesTable.hash} IS DISTINCT FROM EXCLUDED.hash`,
    })
    .returning({
      id: componentsTable.id,
      inserted: sql<boolean>`xmax = 0`,
      updated: sql<boolean>`xmax <> 0 AND ${componentsTable.updated_at} = now()`,
    });
  const issueIdsThatNeedWork = new Set<string>();
  for (const issueRow of issueProcessedRows) {
    if (!issueRow.inserted && !issueRow.updated) {
      // Nothing to do, component row was already up-to-date.
      continue;
    }
    issueIdsThatNeedWork.add(issueRow.id);
  }

  // Prune all subtype memberships for these issues
  await tx
    .delete(issueSubtypeMembershipsTable)
    .where(
      inArray(
        issueSubtypeMembershipsTable.issue_id,
        Array.from(issueIdsThatNeedWork),
      ),
    );
  // Prune all component branch memberships for these issues
  await tx
    .delete(issueComponentBranchMembershipsTable)
    .where(
      inArray(
        issueComponentBranchMembershipsTable.issue_id,
        Array.from(issueIdsThatNeedWork),
      ),
    );
  // Prune all intervals for these issues
  await tx
    .delete(issueIntervalsTable)
    .where(
      inArray(issueIntervalsTable.issue_id, Array.from(issueIdsThatNeedWork)),
    );

  // Prune all updates for these issues
  await tx
    .delete(issueUpdatesTable)
    .where(
      inArray(issueUpdatesTable.issue_id, Array.from(issueIdsThatNeedWork)),
    );

  // Fetch all component branch memberships
  const componentBranchMemberships = await tx
    .select()
    .from(componentBranchMembershipsTable);

  type DbIssueSubtypeMembershipInsert =
    typeof issueSubtypeMembershipsTable.$inferInsert;
  type DbIssueComponentBranchMembershipInsert =
    typeof issueComponentBranchMembershipsTable.$inferInsert;
  type DbIssueUpdateInsert = typeof issueUpdatesTable.$inferInsert;
  type DbIssueIntervalInsert = typeof issueIntervalsTable.$inferInsert;

  const dbIssueSubtypeMemberships: DbIssueSubtypeMembershipInsert[] = [];
  const dbIssueComponentBranchMemberships: DbIssueComponentBranchMembershipInsert[] =
    [];
  const dbIssueUpdates: DbIssueUpdateInsert[] = [];
  const dbIssueIntervals: DbIssueIntervalInsert[] = [];

  for (const issue of issues) {
    if (!issueIdsThatNeedWork.has(issue.id)) {
      // Nothing to do, issue row was already up-to-date.
      continue;
    }

    console.log(`Issue ${issue.id} written to database.`);

    // Write issue subtypes
    for (const subtype of issue.subtypes) {
      dbIssueSubtypeMemberships.push({
        issue_id: issue.id,
        subtype_type: subtype,
      });
    }

    for (const affectedSegment of issue.stationIdsAffected) {
      const componentBranchId = generateComponentBranchId(
        affectedSegment.componentId,
        affectedSegment.branchName,
      );

      assert(
        componentBranchMemberships.length > 0,
        `Expected at least one component branch membership for component branch ${componentBranchId} and station IDs ${affectedSegment.stationIds.join(',')}`,
      );

      // Write issue component branch memberships
      for (const stationId of affectedSegment.stationIds) {
        const componentBranchMembership = componentBranchMemberships.find(
          (membership) =>
            membership.component_branch_id === componentBranchId &&
            membership.station_id === stationId,
        );

        assert(
          componentBranchMembership != null,
          `Expected component branch membership for component branch ${componentBranchId} and station ID ${stationId}`,
        );

        dbIssueComponentBranchMemberships.push({
          component_branch_membership_id: componentBranchMembership.id,
          issue_id: issue.id,
        });
      }
    }

    // Write issue updates
    for (const update of issue.updates) {
      dbIssueUpdates.push({
        issue_id: issue.id,
        type: update.type,
        text: update.text,
        created_at: update.createdAt,
        source_url: update.sourceUrl,
      });
    }

    const intervals = computeIssueIntervals(issue);

    // Write issue intervals
    for (const interval of intervals) {
      assert(interval.start != null);
      assert(interval.end != null);

      dbIssueIntervals.push({
        issue_id: issue.id,
        startAt: interval.start.toISO(),
        endAt: interval.end?.toISO?.() ?? null,
      });
    }
  }

  if (issueIdsThatNeedWork.size > 0) {
    // Write subtype memberships for the issues that were processed
    await tx
      .insert(issueSubtypeMembershipsTable)
      .values(dbIssueSubtypeMemberships);

    // Write issue component branch memberships
    await tx
      .insert(issueComponentBranchMembershipsTable)
      .values(dbIssueComponentBranchMemberships);

    // Write issue updates
    await tx.insert(issueUpdatesTable).values(dbIssueUpdates);

    // Write issue intervals
    await tx.insert(issueIntervalsTable).values(dbIssueIntervals);
  }

  // Prune issues that are no longer in the data.
  const issueDeletionQuery = await tx.delete(issuesTable).where(
    notInArray(
      issuesTable.id,
      issues.map((issue) => issue.id),
    ),
  );
  console.log(`Pruned ${issueDeletionQuery.rowCount} issues`);
});
console.log('Done');
