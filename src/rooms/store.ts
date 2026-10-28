import { randomUUID } from 'node:crypto';
import type { PgDatabase } from '../database/postgres.ts';

export type RoomActor = { userId: string; sessionId: string; displayName: string; authVersion?: number };
export type RoomEvent = { seq: number; id: string | null; actor: string; kind: string; target: string | null; data: unknown };
export class RoomError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
const fail = (status: number, code: string): never => { throw new RoomError(status, code); };
export function identifier(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) fail(400, 'invalid_identifier');
  return value as string;
}
function event(row: any): RoomEvent {
  return { seq: row.seq, id: row.message_id, actor: row.actor_user_id, kind: row.kind, target: row.target_user_id, data: row.data };
}
function canonical(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}

/** 房间行锁串行化成员变更及序号；进程内连接表不参与权限判断。 */
export class RoomStore {
  constructor(readonly db: PgDatabase, readonly isPublishedVersion: (id: string) => Promise<boolean>) {}
  private async room(id: string, lock = false) {
    const row = await this.db.prepare('SELECT * FROM rooms WHERE id=$1' + (lock ? ' FOR UPDATE' : '')).get(identifier(id));
    return row ?? fail(404, 'room_not_found');
  }
  async member(id: string, actor: RoomActor, allowClosed = false) {
    const room = await this.room(id);
    const member = await this.db.prepare('SELECT * FROM room_members WHERE room_id=$1 AND user_id=$2').get(id, actor.userId);
    if (!member?.active || member.banned) fail(403, 'not_a_member');
    if (!allowClosed && room.status !== 'open') fail(410, 'room_closed');
    return room;
  }
  private async append(id: string, actor: RoomActor, kind: string, data: unknown, messageId: string | null = null, target: string | null = null) {
    const updated = await this.db.prepare('UPDATE rooms SET seq=seq+1 WHERE id=$1 RETURNING seq').get(id);
    const row = await this.db.prepare(`INSERT INTO room_events(room_id,seq,actor_user_id,message_id,kind,target_user_id,data)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`).get(id, updated!.seq, actor.userId, messageId, kind, target, JSON.stringify(data));
    return event(row);
  }
  async create(actor: RoomActor, versionId: unknown) {
    const version = identifier(versionId);
    if (!await this.isPublishedVersion(version)) fail(404, 'version_not_found');
    return this.db.transaction(async () => {
      const id = randomUUID();
      await this.db.prepare('INSERT INTO rooms(id,owner_user_id,version_id) VALUES($1,$2,$3)').run(id, actor.userId, version);
      await this.db.prepare('INSERT INTO room_members(room_id,user_id,display_name) VALUES($1,$2,$3)').run(id, actor.userId, actor.displayName.slice(0,80));
      await this.append(id, actor, 'room.created', { userId: actor.userId });
      return this.snapshot(id, actor);
    });
  }
  async join(id: string, actor: RoomActor) {
    return this.db.transaction(async () => {
      const room = await this.room(id, true);
      if (room.status !== 'open') fail(410, 'room_closed');
      if (!await this.isPublishedVersion(room.version_id)) fail(404, 'version_not_found');
      const old = await this.db.prepare('SELECT * FROM room_members WHERE room_id=$1 AND user_id=$2').get(id, actor.userId);
      if (old?.banned) fail(403, 'member_banned');
      if (!old?.active) {
        const count = await this.db.prepare('SELECT count(*)::integer AS n FROM room_members WHERE room_id=$1 AND active').get(id);
        if (count!.n >= 8) fail(409, 'room_full');
        await this.db.prepare(`INSERT INTO room_members(room_id,user_id,display_name) VALUES($1,$2,$3)
          ON CONFLICT(room_id,user_id) DO UPDATE SET active=true,display_name=EXCLUDED.display_name,joined_at=now()`)
          .run(id, actor.userId, actor.displayName.slice(0,80));
        await this.append(id, actor, 'member.joined', { userId: actor.userId, displayName: actor.displayName.slice(0,80) });
      }
      return this.snapshot(id, actor);
    });
  }
  async leave(id: string, actor: RoomActor) {
    return this.db.transaction(async () => {
      await this.room(id, true);
      const room = await this.member(id, actor);
      if (room.owner_user_id === actor.userId) fail(409, 'owner_must_close');
      await this.db.prepare('UPDATE room_members SET active=false WHERE room_id=$1 AND user_id=$2').run(id, actor.userId);
      return this.append(id, actor, 'member.left', { userId: actor.userId });
    });
  }
  async kick(id: string, actor: RoomActor, target: unknown) {
    const userId = identifier(target);
    return this.db.transaction(async () => {
      await this.room(id, true);
      const room = await this.member(id, actor);
      if (room.owner_user_id !== actor.userId || userId === actor.userId) fail(403, 'owner_required');
      const result = await this.db.prepare('UPDATE room_members SET active=false,banned=true WHERE room_id=$1 AND user_id=$2 AND active').run(id, userId);
      if (!result.changes) fail(404, 'member_not_found');
      return this.append(id, actor, 'member.kicked', { userId });
    });
  }
  async close(id: string, actor: RoomActor) {
    return this.db.transaction(async () => {
      await this.room(id, true);
      const room = await this.member(id, actor, true);
      if (room.owner_user_id !== actor.userId) fail(403, 'owner_required');
      if (room.status === 'closed') return { closed: true };
      await this.db.prepare("UPDATE rooms SET status='closed' WHERE id=$1").run(id);
      await this.append(id, actor, 'room.closed', {});
      return { closed: true };
    });
  }
  async snapshot(id: string, actor: RoomActor) {
    return this.db.transaction(async () => {
      await this.room(id, true);
      const room = await this.member(id, actor, true);
      const members = await this.db.prepare('SELECT user_id AS "userId",display_name AS "displayName" FROM room_members WHERE room_id=$1 AND active ORDER BY joined_at,user_id').all(id);
      return { id, ownerUserId: room.owner_user_id, versionId: room.version_id, status: room.status, seq: room.seq, state: room.state, stateSeq: room.state_seq, members };
    });
  }
  async sync(id: string, actor: RoomActor, after: number, includeSnapshot = true) {
    if (!Number.isSafeInteger(after) || after < 0) fail(400, 'invalid_sequence');
    return this.db.transaction(async () => {
      await this.room(id, true);
      const room = await this.member(id, actor, true);
      if (after > room.seq) fail(409, 'sequence_ahead');
      const rows = await this.db.prepare('SELECT * FROM room_events WHERE room_id=$1 AND seq>$2 ORDER BY seq LIMIT 16').all(id, after);
      return {
        ...(includeSnapshot ? { snapshot: await this.snapshot(id, actor) } : {}),
        events: rows.filter(r => !r.target_user_id || r.target_user_id === actor.userId || r.actor_user_id === actor.userId).map(event),
        cursor: rows.at(-1)?.seq ?? after, head: room.seq,
      };
    });
  }
  async send(id: string, actor: RoomActor, input: any) {
    const messageId = identifier(input?.id);
    const kind = input?.kind;
    if (!['state','offer','answer','ice'].includes(kind)) fail(400, 'invalid_event');
    const data = input.data ?? {};
    if (Buffer.byteLength(JSON.stringify(data)) > 10_240) fail(413, 'event_too_large');
    const target = kind === 'state' ? null : identifier(input.target);
    return this.db.transaction(async () => {
      await this.room(id, true);
      const room = await this.member(id, actor);
      if (kind === 'state' && room.owner_user_id !== actor.userId) fail(403, 'owner_required');
      if (target) {
        if (target === actor.userId) fail(400, 'invalid_target');
        const member = await this.db.prepare('SELECT active,banned FROM room_members WHERE room_id=$1 AND user_id=$2').get(id, target);
        if (!member?.active || member.banned) fail(403, 'target_not_a_member');
      }
      const previous = await this.db.prepare('SELECT * FROM room_events WHERE room_id=$1 AND actor_user_id=$2 AND message_id=$3').get(id, actor.userId, messageId);
      if (previous) {
        if (previous.kind !== kind || previous.target_user_id !== target || canonical(previous.data) !== canonical(data)) fail(409, 'message_id_conflict');
        return event(previous);
      }
      const result = await this.append(id, actor, kind, data, messageId, target);
      if (kind === 'state') await this.db.prepare('UPDATE rooms SET state=$2::jsonb,state_seq=$3 WHERE id=$1').run(id, JSON.stringify(data), result.seq);
      return result;
    });
  }
}
