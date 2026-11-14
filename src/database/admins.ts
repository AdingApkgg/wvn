import type {Migration} from './migrations.ts';
export const adminMigrations:Migration[]=[{id:'010-admin-roles',sql:`
CREATE TABLE wg_admin_roles(
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  active boolean NOT NULL,
  revision bigint NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`}];
