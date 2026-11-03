import type { Migration } from './migrations.ts';
import { contentShareClassificationMigration } from './content-share-classification.ts';

export const contentAccountMigrations: Migration[] = [{ id: '006-content-accounts', sql: `
CREATE TABLE wg_content_eligibility(
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  status text NOT NULL CHECK(status IN ('unqualified','qualified','suspended','needs_retest')),
  policy_version text, quiz_version text, qualified_at bigint, granted_by text, updated_at bigint NOT NULL
);
CREATE TABLE wg_content_attempts(
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  policy_version text NOT NULL, quiz_version text NOT NULL,
  created_at bigint NOT NULL, expires_at bigint NOT NULL,
  questions jsonb, submitted_at bigint, invalidated_at bigint, result jsonb,
  CHECK((submitted_at IS NULL AND result IS NULL) OR (submitted_at IS NOT NULL AND result IS NOT NULL))
);
CREATE INDEX wg_content_attempts_owner ON wg_content_attempts(user_id,created_at);
CREATE INDEX wg_content_attempts_submitted ON wg_content_attempts(user_id,submitted_at) WHERE submitted_at IS NOT NULL;
CREATE UNIQUE INDEX wg_content_attempt_active ON wg_content_attempts(user_id) WHERE submitted_at IS NULL AND invalidated_at IS NULL;
CREATE TABLE wg_content_session_modes(
  session_id text PRIMARY KEY REFERENCES session(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  policy_version text NOT NULL, mode text NOT NULL CHECK(mode IN ('public','restricted')), updated_at bigint NOT NULL
);
CREATE INDEX wg_content_modes_owner ON wg_content_session_modes(user_id);
CREATE TABLE wg_content_audit(
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  action text NOT NULL, reason text NOT NULL, actor text NOT NULL, created_at bigint NOT NULL
);
CREATE INDEX wg_content_audit_owner ON wg_content_audit(user_id,created_at);
` }, contentShareClassificationMigration];
