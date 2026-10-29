import type { Migration } from '../database/migrations.ts';

/** 与账号和目录迁移独立，可在专用 PostgreSQL schema 中单独应用。 */
export const resourceMigrations: Migration[] = [{ id: '003-resources-postgres', sql: `
CREATE TABLE wvn_resource_objects(
  sha256 text PRIMARY KEY CHECK(sha256 ~ '^[0-9a-f]{64}$'),
  bytes bigint NOT NULL CHECK(bytes BETWEEN 0 AND 9007199254740991)
);
CREATE TABLE wvn_resource_snapshots(
  namespace text COLLATE "C" PRIMARY KEY CHECK(length(namespace) BETWEEN 1 AND 512),
  inventory_sha256 text NOT NULL CHECK(inventory_sha256 ~ '^[0-9a-f]{64}$'),
  source_sha256 text CHECK(source_sha256 ~ '^[0-9a-f]{64}$'),
  metadata_sha256 text CHECK(metadata_sha256 ~ '^[0-9a-f]{64}$'),
  total bigint NOT NULL DEFAULT 0 CHECK(total>=0),
  logical_bytes bigint NOT NULL DEFAULT 0 CHECK(logical_bytes>=0),
  checkpoint text COLLATE "C" NOT NULL DEFAULT '',
  processed bigint NOT NULL DEFAULT 0 CHECK(processed>=0 AND processed<=total),
  published boolean NOT NULL DEFAULT false,
  lease_run_id uuid,
  lease_until timestamptz,
  completed_at timestamptz
);
CREATE TABLE wvn_resources(
  key uuid PRIMARY KEY,
  namespace text COLLATE "C" NOT NULL REFERENCES wvn_resource_snapshots(namespace),
  original_path text COLLATE "C" NOT NULL CHECK(length(original_path) BETWEEN 1 AND 16384),
  sha256 text NOT NULL REFERENCES wvn_resource_objects(sha256),
  content_type text NOT NULL CHECK(length(content_type) BETWEEN 1 AND 512 AND content_type !~ '[\r\n]'),
  source_file_id text NOT NULL CHECK(length(source_file_id) BETWEEN 1 AND 2048),
  target_file_id text NOT NULL CHECK(length(target_file_id) BETWEEN 1 AND 2048),
  content_sha1 text NOT NULL CHECK(content_sha1 ~ '^[0-9a-f]{40}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(namespace,original_path)
);
CREATE INDEX wvn_resources_sha256 ON wvn_resources(sha256);
CREATE TABLE wvn_resource_import_runs(
  id uuid PRIMARY KEY,
  namespace text NOT NULL,
  source_sha256 text,
  inventory_sha256 text,
  metadata_sha256 text,
  status text NOT NULL CHECK(status IN ('validating','running','complete','failed')),
  total bigint NOT NULL DEFAULT 0,
  processed bigint NOT NULL DEFAULT 0,
  inserted bigint NOT NULL DEFAULT 0,
  checkpoint text NOT NULL DEFAULT '',
  error_code text,
  error_path text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX wvn_resource_import_runs_namespace ON wvn_resource_import_runs(namespace,started_at DESC);
` }, { id: '007-resource-http-metadata', sql: `
ALTER TABLE wvn_resource_objects
  ADD COLUMN http_content_type text,
  ADD COLUMN http_metadata_proof_sha256 text,
  ADD CONSTRAINT wvn_resource_objects_http_metadata CHECK (
    (http_content_type IS NULL AND http_metadata_proof_sha256 IS NULL) OR
    (http_content_type IS NOT NULL AND http_metadata_proof_sha256 IS NOT NULL
      AND length(http_content_type) BETWEEN 3 AND 512
      AND http_content_type !~ '[^ -~]'
      AND http_content_type ~ $mime$^[A-Za-z0-9!#$%&'*+.^_\`|~-]+/[A-Za-z0-9!#$%&'*+.^_\`|~-]+(; *[A-Za-z0-9!#$%&'*+.^_\`|~-]+=([A-Za-z0-9!#$%&'*+.^_\`|~-]+|"[^"\\\\]*"))*$$mime$
      AND http_metadata_proof_sha256 ~ '^[0-9a-f]{64}$')
  );
` }];
