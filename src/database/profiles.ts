import type { Migration } from './migrations.ts';

export const profileMigrations: Migration[] = [{ id: '009-public-profiles-dashboard', sql: `
CREATE TABLE wg_public_profiles (
  uid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  bio text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 0
);
INSERT INTO wg_public_profiles(user_id) SELECT id FROM "user" ORDER BY "createdAt", id COLLATE "C";
CREATE FUNCTION wg_create_public_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO wg_public_profiles(user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER wg_create_public_profile AFTER INSERT ON "user" FOR EACH ROW EXECUTE FUNCTION wg_create_public_profile();
CREATE TABLE wg_dashboard_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  target text NOT NULL,
  reason text NOT NULL DEFAULT '',
  status integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
` }];
