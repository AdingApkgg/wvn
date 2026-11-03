import type { Migration } from './migrations.ts';

export const contentShareClassificationMigration: Migration = { id: '007-content-share-classification', sql: `
ALTER TABLE wg_save_shares
  ADD COLUMN content_suitability text NOT NULL DEFAULT 'unknown' CHECK(content_suitability IN ('sfw','nsfw','unknown')),
  ADD COLUMN content_reviewed_revision bigint CHECK(content_reviewed_revision>0),
  ADD COLUMN content_reason text NOT NULL DEFAULT '';
ALTER TABLE wg_content_audit
  ADD COLUMN share_id text,
  ADD COLUMN content_suitability text CHECK(content_suitability IN ('sfw','nsfw','unknown')),
  ADD COLUMN metadata_revision bigint;
` };
