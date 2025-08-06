import { pgTable, text } from 'drizzle-orm/pg-core';

export const landmarksTable = pgTable('landmarks', {
  id: text().primaryKey(),
  title: text().notNull(),
  'title_zh-Hans': text().notNull(),
  title_ms: text().notNull(),
  title_ta: text().notNull(),
});
