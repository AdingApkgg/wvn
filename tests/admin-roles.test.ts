import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Hono} from 'hono';
import {shareHttpFixture} from './helpers/share-http.ts';
import {AccountError} from '../src/accounts/errors.server.ts';
import {mountDashboard} from '../src/accounts/dashboard.server.ts';
import {AdminStore} from '../src/accounts/admins.server.ts';

test('admins can delegate and revoke permissions immediately with protected owner and durable audit',async()=>{
 const f=await shareHttpFixture();
 try{
  const ownerCookie=await f.register('Owner'),owner=await(await f.api('/api/me',ownerCookie)).json();
  const delegateCookie=await f.register('Delegate'),delegate=await(await f.api('/api/me',delegateCookie)).json();
  const readerCookie=await f.register('Reader'),reader=await(await f.api('/api/me',readerCookie)).json();
  f.service.config.adminUserIds=[owner.user.id];
  f.service.app=new Hono().route('/',f.service.app).onError((e,c)=>c.json({code:e instanceof AccountError?e.code:'ERROR'},e instanceof AccountError?e.status:500));
  mountDashboard(f.service);
  const change=(uid:string,cookie:string,binding:string,action='grant',revision=0,reason='授权测试')=>f.api('/api/dash/users/'+uid+'/admin',cookie,{action,revision,reason},binding);
  assert.equal((await change(reader.user.uid,readerCookie,reader.binding)).status,403);
  assert.equal((await change(delegate.user.uid,ownerCookie,'wrong')).status,409);
  assert.equal((await change(delegate.user.uid,ownerCookie,owner.binding,'grant',0,'')).status,400);
  assert.equal((await change(delegate.user.uid,ownerCookie,owner.binding)).status,200);
  assert.equal((await(await f.api('/api/me',delegateCookie)).json()).admin,true);
  assert.equal((await f.api('/api/dash/overview',delegateCookie)).status,200);
  const fresh=new AdminStore(f.service.db,()=>new Set([owner.user.id]));
  assert.equal(await fresh.isAdmin(delegate.user.id),true);
  const listed=(await(await f.api('/api/dash/users',ownerCookie)).json()).items;
  assert.equal(listed.find((u:any)=>u.id===owner.user.id).adminProtected,true);
  assert.equal(listed.find((u:any)=>u.id===delegate.user.id).adminRevision,1);
  assert.equal((await change(owner.user.uid,delegateCookie,delegate.binding,'revoke')).status,403);
  assert.equal((await change(delegate.user.uid,delegateCookie,delegate.binding,'revoke',1)).status,403);
  assert.equal((await change(reader.user.uid,delegateCookie,delegate.binding)).status,200);
  assert.equal((await change(delegate.user.uid,ownerCookie,owner.binding,'revoke',0)).status,409);
  assert.equal((await change(delegate.user.uid,ownerCookie,owner.binding,'revoke',1)).status,200);
  assert.equal((await(await f.api('/api/me',delegateCookie)).json()).admin,false);
  assert.equal((await f.api('/api/dash/overview',delegateCookie)).status,403);
  assert.equal(await fresh.isAdmin(reader.user.id),true);
  await assert.rejects(()=>fresh.change(delegate.user.id,reader.user.id,'revoke',1,'失权后操作'),(e:any)=>e.status===403);
  const audit=await(await f.api('/api/dash/audit',ownerCookie)).json();
  const roles=audit.filter((r:any)=>r.action.startsWith('admin.'));
  assert.equal(roles.length,3);assert.ok(roles.every((r:any)=>r.reason==='授权测试'&&r.status===200));
  assert.equal(roles[0].actor,owner.user.id);assert.ok(roles[0].target.includes(delegate.user.uid));
  await f.service.db.prepare('UPDATE session SET "createdAt"=$1 WHERE "userId"=$2').run(new Date(Date.now()-11*60000),owner.user.id);
  const stale=await change(reader.user.uid,ownerCookie,owner.binding,'revoke',1);
  assert.equal(stale.status,403);assert.equal((await stale.json()).code,'REAUTH_REQUIRED');
 }finally{await f.close()}
});

test('role writes serialize conflicting grants and roll back if the audit cannot be stored',async()=>{
 const f=await shareHttpFixture();
 try{
  const ownerCookie=await f.register('Owner'),owner=await(await f.api('/api/me',ownerCookie)).json();
  const targetCookie=await f.register('Target'),target=await(await f.api('/api/me',targetCookie)).json();
  f.service.config.adminUserIds=[owner.user.id];
  const store=new AdminStore(f.service.db,()=>new Set([owner.user.id]));
  await f.service.db.exec("ALTER TABLE wg_dashboard_audit ADD CONSTRAINT reject_role_test CHECK(action<>'admin.grant')");
  await assert.rejects(()=>store.change(owner.user.id,target.user.id,'grant',0,'审计失败测试'),(e:any)=>e.code==='23514');
  assert.deepEqual(await store.describe(target.user.id),{admin:false,adminProtected:false,adminRevision:0});
  await f.service.db.exec('ALTER TABLE wg_dashboard_audit DROP CONSTRAINT reject_role_test');
  const results=await Promise.allSettled([store.change(owner.user.id,target.user.id,'grant',0,'并发授权'),store.change(owner.user.id,target.user.id,'grant',0,'并发授权')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const failed=results.find(r=>r.status==='rejected') as PromiseRejectedResult;assert.equal(failed.reason.status,409);
  assert.equal((await f.service.db.prepare("SELECT count(*) AS n FROM wg_dashboard_audit WHERE action='admin.grant'").get())!.n,1);
 }finally{await f.close()}
});

test('an actor revoked while waiting on the role lock cannot grant permissions',async()=>{
 const f=await shareHttpFixture();let locker:any;
 try{
  const oc=await f.register('Owner'),owner=await(await f.api('/api/me',oc)).json();
  const dc=await f.register('Delegate'),delegate=await(await f.api('/api/me',dc)).json();
  const tc=await f.register('Target'),target=await(await f.api('/api/me',tc)).json();
  const store=new AdminStore(f.service.db,()=>new Set([owner.user.id]));await store.change(owner.user.id,delegate.user.id,'grant',0,'初始授权');
  locker=await f.service.db.pool.connect();await locker.query('BEGIN');await locker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['wvn:admin-roles']);
  const pending=store.change(delegate.user.id,target.user.id,'grant',0,'排队授权').then(()=>null,e=>e);
  let waiting=false;
  for(let i=0;i<100;i++){
   const result=await locker.query("SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE 'SELECT pg_advisory_xact_lock%'");
   if(Number(result.rows[0].n)>0){waiting=true;break}await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.ok(waiting,'grant must be queued behind the transaction lock');
  await locker.query('UPDATE wg_admin_roles SET active=false,revision=revision+1 WHERE user_id=$1',[delegate.user.id]);await locker.query('COMMIT');locker.release();locker=null;
  assert.equal((await pending).status,403);assert.equal(await store.isAdmin(target.user.id),false);
 }finally{if(locker){await locker.query('ROLLBACK');locker.release()}await f.close()}
});
