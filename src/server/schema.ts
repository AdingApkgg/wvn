import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const works = sqliteTable("works", {
  id: text().primaryKey(),
  title: text().notNull(),
  originalTitle: text("original_title").notNull(),
  aliases: text().notNull(),
  evidence: text().notNull(),
  nextNumber: integer("next_number").notNull(),
  revision: integer().notNull(),
  defaultId: text("default_id"),
});
export const versions = sqliteTable(
  "versions",
  {
    id: text().primaryKey(),
    workId: text("work_id")
      .notNull()
      .references(() => works.id),
    number: integer().notNull(),
    title: text().notNull(),
    legacyPath: text("legacy_path").notNull().unique(),
    engine: text().notNull(),
    revision: integer().notNull(),
    status: text().notNull(),
    createdAt: text("created_at").notNull(),
    language: text().notNull().default("未标注"),
    notes: text().notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("work_slot").on(t.workId, t.number)],
);
