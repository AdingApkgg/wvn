import type { Migration } from '../database/migrations.ts';

export const roomMigrations: Migration[] = [{ id: '005-rooms-postgres', sql: `
CREATE TABLE rooms (
 id text PRIMARY KEY, owner_user_id text NOT NULL, version_id text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 seq bigint NOT NULL DEFAULT 0 CHECK(seq>=0), state jsonb NOT NULL DEFAULT '{}',
 state_seq bigint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE room_members (
 room_id text NOT NULL REFERENCES rooms(id), user_id text NOT NULL, display_name text NOT NULL,
 active boolean NOT NULL DEFAULT true, banned boolean NOT NULL DEFAULT false,
 joined_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(room_id,user_id)
);
CREATE TABLE room_events (
 room_id text NOT NULL REFERENCES rooms(id), seq bigint NOT NULL,
 actor_user_id text NOT NULL, message_id text, kind text NOT NULL,
 target_user_id text, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(room_id,seq), UNIQUE(room_id,actor_user_id,message_id)
);
CREATE INDEX room_members_active ON room_members(user_id,room_id) WHERE active;
` }];
