import { accountContract } from "../api/contracts/account.ts";
import { registerJsonRoute } from "../api/route.server.ts";
import { z } from 'zod';
import type { PgDatabase } from '../database/postgres.ts';
import type { AccountService } from './service.server.ts';
import { AccountError } from './errors.server.ts';

const text = (max: number) => z.string().trim().max(max).refine(value => !/[\p{Cc}\p{Cf}]/u.test(value));
const update = z.object({
  name: text(80).min(1).refine(value => [...value].length <= 40),
  bio: z.string().trim().refine(value => [...value].length <= 200 && !/[\p{Cc}\p{Cf}]/u.test(value.replace(/\n/g,''))),
  published: z.boolean(), revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();
export function validUid(uid: string) { return /^[1-9]\d{0,18}$/.test(uid) && BigInt(uid) <= 9223372036854775807n; }
export function adminIds(config: AccountService['config']) {
  return new Set(config.adminUserIds ?? (process.env.WG_ADMIN_USER_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean));
}
export class ProfileStore {
  constructor(private db: PgDatabase) {}
  async readOwn(userId: string) {
    const row = await this.db.prepare(`SELECT p.uid::text AS uid,p.bio,p.published,p.revision,u.name,u."createdAt" AS joined_at
      FROM wg_public_profiles p JOIN "user" u ON u.id=p.user_id WHERE p.user_id=$1`).get(userId);
    if (!row) throw new AccountError(404,'PROFILE_UNAVAILABLE');
    return {uid: String(row.uid),name: String(row.name),bio: String(row.bio),published: Boolean(row.published),revision:Number(row.revision),joinedAt:new Date(row.joined_at as string).toISOString()};
  }
  async update(userId: string, input: unknown) {
    const result = update.safeParse(input);
    if (!result.success) throw new AccountError(400,'PROFILE_INVALID');
    const body = result.data;
    return this.db.transaction(async () => {
      const row = await this.db.prepare('SELECT revision FROM wg_public_profiles WHERE user_id=$1 FOR UPDATE').get(userId);
      if (!row) throw new AccountError(404,'PROFILE_UNAVAILABLE');
      if (Number(row.revision) !== body.revision) throw new AccountError(409,'PROFILE_CONFLICT');
      await this.db.prepare('UPDATE wg_public_profiles SET bio=$1,published=$2,revision=revision+1 WHERE user_id=$3').run(body.bio,body.published,userId);
      await this.db.prepare('UPDATE "user" SET name=$1,"updatedAt"=now() WHERE id=$2').run(body.name,userId);
      return this.readOwn(userId);
    });
  }
  async publicProfile(uid: string) {
    if (!validUid(uid)) throw new AccountError(404,'PROFILE_UNAVAILABLE');
    const row = await this.db.prepare(`SELECT p.uid::text AS uid,p.bio,u.name,u."createdAt" AS joined_at
      FROM wg_public_profiles p JOIN "user" u ON u.id=p.user_id WHERE p.uid=$1 AND p.published=true`).get(uid);
    if (!row) throw new AccountError(404,'PROFILE_UNAVAILABLE');
    return {uid:String(row.uid),name:String(row.name),bio:String(row.bio),joinedAt:new Date(row.joined_at as string).toISOString()};
  }
}
export function mountProfiles(service: AccountService) {
  const { app, profiles, player, sharing, db } = service;
  registerJsonRoute(app, accountContract.profileGet,async c => c.json(await profiles.readOwn((await player(c)).session.user.id)));
  registerJsonRoute(app, accountContract.profileUpdate,async c => c.json(await profiles.update((await player(c)).session.user.id,await c.req.json())), { invalidCode: "PROFILE_INVALID" });
  registerJsonRoute(app, accountContract.publicProfileGet,async c => c.json(await profiles.publicProfile(c.req.param('uid')!)));
  registerJsonRoute(app, accountContract.publicProfileShares,async c => {
    const uid = c.req.param('uid')!;
    await profiles.publicProfile(uid);
    const page = Number(c.req.query('page') ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new AccountError(400,'PAGE_INVALID');
    if (!sharing) return c.json({items:[],next:null});
    await sharing.catalog.refresh();
    const rows = await db.prepare(`SELECT s.id FROM wg_save_shares s JOIN wg_public_profiles p ON p.user_id=s.owner
      WHERE p.uid=$1 AND p.published=true AND s.mode='public' AND s.state='active' AND s.approved IS NOT NULL
      AND (s.expires IS NULL OR s.expires>$2) ORDER BY s.created DESC,s.id DESC LIMIT 21 OFFSET $3`).all(uid,Date.now(),(page-1)*20);
    const items = [];
    for (const row of rows.slice(0,20)) {
      try { items.push(await sharing.inspect(String(row.id))); }
      catch (error) { if (!(error instanceof AccountError && error.status===404)) throw error; }
    }
    return c.json({items,next:rows.length>20?page+1:null});
  }, { invalidCode: "PAGE_INVALID" });
}
