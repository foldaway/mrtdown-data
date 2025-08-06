import { real, pgTable, text } from 'drizzle-orm/pg-core';
import { townsTable } from './towns';
import { binary } from '../types/binary';

export const stationsTable = pgTable('stations', {
  id: text().primaryKey(),
  name: text(),
  'name_zh-Hans': text(),
  name_ms: text(),
  name_ta: text(),
  town_id: text()
    .references(() => townsTable.id)
    .notNull(),
  lat: real().notNull(),
  lng: real().notNull(),
  hash: binary().notNull(),
});
