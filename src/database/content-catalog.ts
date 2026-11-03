import type { Migration } from "./migrations.ts";

// 分类独立于目录的生命周期和来源元数据，不改写既有迁移。
export const contentCatalogMigrations: Migration[] = [{
  id: "001-content-classification",
  sql: `
CREATE TABLE content_classifications(
 kind text NOT NULL CHECK(kind IN ('work','version','image')),
 id text NOT NULL, revision integer NOT NULL CHECK(revision>0),
 manual boolean NOT NULL DEFAULT false, payload text NOT NULL,
 PRIMARY KEY(kind,id)
);
CREATE TABLE content_classification_history(
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 kind text NOT NULL,id text NOT NULL,revision integer NOT NULL,
 manual boolean NOT NULL,payload text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(kind,id,revision)
);
`,
}, {
  id: "002-content-classification-fingerprint",
  sql: `
ALTER TABLE content_classifications ADD COLUMN fingerprint text
 CHECK(fingerprint IS NULL OR fingerprint ~ '^[0-9a-f]{64}$');
ALTER TABLE content_classification_history ADD COLUMN fingerprint text;
`,
}];
