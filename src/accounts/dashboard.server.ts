import type { AccountService } from './service.server.ts';
import type { Store } from '../server/store.ts';
import { registerManagementRoutes } from '../server/http.ts';
import { registerShareAdminRoutes } from './share-admin.server.ts';
import { validUid } from './profiles.server.ts';
import { AccountError } from './errors.server.ts';

export function mountDashboard(service: AccountService, catalog?: {store: Store; sources: unknown}) {
  const { app, db, player, admins } = service;
  const actor = new WeakMap<Request,string>();
  const guard: Parameters<typeof app.use>[1] = async (c,next) => {
    c.header('Cache-Control','private, no-store');
    let id: string;
    try { id = (await player(c)).session.user.id; }
    catch (error) {
      if (error instanceof AccountError && error.status === 401 && !c.req.path.startsWith('/api/'))
        return c.redirect('/account?returnTo=' + encodeURIComponent(c.req.path + new URL(c.req.url).search));
      throw error;
    }
    if (!await admins.isAdmin(id)) throw new AccountError(403,'ADMIN_REQUIRED');
    actor.set(c.req.raw,id);
    await next();
  };
  for (const path of ['/api/dash/*','/dash','/dash/*','/dash.data']) app.use(path,guard);
  app.use('/api/dash/*',async (c,next) => {
    if (['GET','HEAD'].includes(c.req.method) || /^\/api\/dash\/users\/[^/]+\/admin$/.test(c.req.path)) return next();
    const body = await c.req.raw.clone().json().catch(() => null);
    const classification = c.req.path === '/api/dash/manage/content-classification';
    const rawReason = classification ? body?.payload?.reason : body?.reason;
    const reason = typeof rawReason === 'string' ? rawReason.slice(0,1000) : '';
    let target = c.req.path;
    if (classification && ['work','version','image'].includes(body?.kind) && typeof body?.id === 'string' && body.id.length <= 500)
      target += '/' + body.kind + '/' + encodeURIComponent(body.id);
    const operation = ['approve','block','reject','resolve','revoke','suspend','unsuspend','require_retest'].includes(body?.action) ? ':' + body.action : '';
    const row = await db.prepare(`INSERT INTO wg_dashboard_audit(actor,action,target,reason) VALUES($1,$2,$3,$4) RETURNING id`)
      .get(actor.get(c.req.raw),c.req.method + operation,target,reason);
    await next();
    // 只读取校验后的成功响应中的对象标识，不把整个输入、报告正文或任何凭据写入审计。
    if (c.res.ok && c.req.method === 'POST' && /^\/api\/dash\/manage\/(?:works(?:\/[^/]+\/versions)?|pending\/[^/]+\/assign|reports)$/.test(c.req.path)) {
      const result = await c.res.clone().json().catch(() => null);
      if (typeof result?.id === 'string') target += '/' + encodeURIComponent(result.id);
      else if (typeof result?.versionId === 'string') target += '/' + encodeURIComponent(result.versionId) + '/' + encodeURIComponent(result.kind) + '/' + encodeURIComponent(result.runId);
    }
    await db.prepare('UPDATE wg_dashboard_audit SET status=$1,target=$2 WHERE id=$3').run(c.res.status,target,row!.id);
  });
  app.get('/api/dash/overview',async c => {
    const users = await db.prepare('SELECT count(*) AS n FROM "user"').get();
    const pending = await db.prepare("SELECT count(*) AS n FROM wg_save_shares WHERE state IN ('pending','active') AND pending IS NOT NULL AND (expires IS NULL OR expires>$1)").get(Date.now());
    const works = catalog ? await catalog.store.list(true) : null;
    return c.json({users:Number(users!.n),pendingShares:Number(pending!.n),works:works?.length ?? null,versions:works?.reduce((sum,w)=>sum+w.versions.length,0) ?? null,catalogAvailable:!!catalog,contentEnabled:!!service.config.contentGate});
  });
  app.get('/api/dash/users',async c => {
    const q = (c.req.query('q') ?? '').trim(), page = Number(c.req.query('page') ?? 1);
    if (q.length>100 || !Number.isSafeInteger(page) || page<1 || page>10000) throw new AccountError(400,'PAGE_INVALID');
    const pattern = '%' + q.replace(/[\\%_]/g,'\\$&') + '%';
    const rows = await db.prepare(`SELECT u.id,u.name,u."createdAt" AS joined_at,p.uid::text AS uid,p.published,e.status AS eligibility,r.active AS admin,r.revision AS admin_revision
      FROM "user" u JOIN wg_public_profiles p ON p.user_id=u.id LEFT JOIN wg_content_eligibility e ON e.user_id=u.id LEFT JOIN wg_admin_roles r ON r.user_id=u.id
      WHERE u.id ILIKE $1 OR u.name ILIKE $1 OR p.uid::text=$2
      ORDER BY p.uid LIMIT 21 OFFSET $3`).all(pattern,q,(page-1)*20);
    return c.json({items:rows.slice(0,20).map(row=>({id:String(row.id),uid:String(row.uid),name:String(row.name),published:!!row.published,joinedAt:new Date(row.joined_at as string).toISOString(),eligibility:row.eligibility ?? 'unqualified',admin:admins.protected(String(row.id))||row.admin===true,adminProtected:admins.protected(String(row.id)),adminRevision:Number(row.admin_revision??0)})),next:rows.length>20?page+1:null});
  });
  app.get('/api/dash/audit',async c => c.json(await db.prepare('SELECT id,actor,action,target,reason,status,created_at FROM wg_dashboard_audit ORDER BY id DESC LIMIT 100').all()));
  app.get('/api/dash/users/:uid',async c => {
    if (!validUid(c.req.param('uid'))) throw new AccountError(404,'NOT_FOUND');
    const row = await db.prepare('SELECT user_id FROM wg_public_profiles WHERE uid=$1').get(c.req.param('uid'));
    if (!row) throw new AccountError(404,'NOT_FOUND');
    return c.json({id:String(row.user_id),...await service.profiles.readOwn(String(row.user_id)),...await admins.describe(String(row.user_id))});
  });
  app.post('/api/dash/users/:uid/admin',async c => {
    const current=await player(c,true);
    const uid=c.req.param('uid');
    if(!validUid(uid))throw new AccountError(404,'NOT_FOUND');
    const body=await c.req.json();
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='action,reason,revision')throw new AccountError(400,'ADMIN_CHANGE_INVALID');
    const row=await db.prepare('SELECT user_id FROM wg_public_profiles WHERE uid=$1').get(uid);
    if(!row)throw new AccountError(404,'NOT_FOUND');
    return c.json(await admins.change(current.session.user.id,String(row.user_id),body.action,body.revision,body.reason));
  });
  if (catalog) registerManagementRoutes(app,catalog.store,catalog.sources,'/api/dash/manage');
  registerShareAdminRoutes(app,service,'/api/dash/shares');
}
