import {
  check,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { componentBranchesTable } from './component_branches';
import { stationsTable } from './stations';
import { sql } from 'drizzle-orm';

export const componentBranchMembershipsTable = pgTable(
  'component_branch_memberships',
  {
    id: serial().primaryKey(),
    component_branch_id: text()
      .references(() => componentBranchesTable.id, {
        onUpdate: 'cascade',
        onDelete: 'cascade',
      })
      .notNull(),
    station_id: text()
      .references(() => stationsTable.id)
      .notNull(),
    code: text().notNull(),
    structure_type: text().notNull(),
    startedAt: timestamp({ mode: 'string', withTimezone: true }).notNull(),
    endedAt: timestamp({ mode: 'string', withTimezone: true }),
    order_index: integer().notNull(),
  },
  (table) => [
    unique('component_branch_memberships_unique_idx').on(
      table.component_branch_id,
      table.station_id,
      table.code,
      table.order_index,
    ),
    check(
      'type_check',
      sql`${table.structure_type} IN ('elevated', 'underground', 'at_grade', 'in_building')`,
    ),
  ],
);
