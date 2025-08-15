import { primaryKey, pgTable, text } from 'drizzle-orm/pg-core';
import { stationsTable } from './stations';

export const stationLandmarksTable = pgTable(
  'station_landmarks',
  {
    station_id: text()
      .references(() => stationsTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
    landmark_id: text().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.station_id, table.landmark_id],
    }),
  ],
);
