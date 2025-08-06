import { pgTable, text } from 'drizzle-orm/pg-core';

export const townsTable = pgTable('towns', {
  id: text().primaryKey(),
  title: text().notNull().unique(),
  'title_zh-Hans': text().notNull(),
  title_ms: text().notNull(),
  title_ta: text().notNull(),
});
