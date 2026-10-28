import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {backupRoot,restoreDatabase} from './helpers/backup.ts';
import {createAccountBackup,prepareAccountRestore,applyAccountRestore} from '../src/accounts/backup.server.ts';
import {join} from 'node:path';
import {shareHttpFixture} from './helpers/share-http.ts';
import {createAccountService} from './helpers/accounts.ts';
const origin='https://accounts.wg.test';

test('visitor signing has a persistent site limit even behind a loopback proxy',async()=>{
 const f=await shareHttpFixture();
 try{
  const path='/api/public/works/v4/read',first=await f.api(path,'',{versionId:'version-a'});assert.equal(first.status,202);const cookie=first.headers.getSetCookie()[0].split(';',1)[0];
  for(let i=1;i<600;i++)assert.equal((await f.api(path,'',{versionId:'version-a'})).status,202);
  const capped=await f.api(path,'',{versionId:'version-a'});assert.equal(capped.status,429);assert.equal(capped.headers.getSetCookie().length,0);
  assert.equal((await f.api(path,cookie,{versionId:'version-a'})).status,200,'Existing visitors remain usable');
  assert.equal((await f.api('/api/login-options')).status,200,'Account APIs do not share the signing quota');
 }finally{f.close()}
});

test('public reads bootstrap a signed visitor before counting and reject opaque or foreign requests',async()=>{
 const f=await shareHttpFixture();
 try{
  const path='/api/public/works/v4/read',stats='/api/public/work-stats?ids=v4';
  assert.deepEqual(await(await f.api(stats)).json(),{v4:{reads:0,likes:0,favorites:0}});
  const first=await f.api(path,'',{versionId:'version-a'});assert.equal(first.status,202);assert.deepEqual(await first.json(),{visitorRequired:true});
  const cookies=first.headers.getSetCookie();assert.equal(cookies.length,1);assert.match(cookies[0],/HttpOnly/);assert.match(cookies[0],/Secure/);
  assert.equal((await(await f.api(stats)).json()).v4.reads,0);
  const cookie=cookies[0].split(';',1)[0];const counted=await f.api(path,cookie,{versionId:'version-a'});assert.equal(counted.status,200);assert.equal((await counted.json()).counted,true);
  assert.equal((await(await f.api(path,cookie,{versionId:'version-a'})).json()).counted,false);
  assert.equal((await f.api(path,cookie,{versionId:'not-this-work'})).status,404);
  assert.equal((await f.service.app.request(origin+path,{method:'POST',headers:{origin:'null','content-type':'application/json',cookie},body:JSON.stringify({versionId:'version-a'})})).status,403);
  assert.equal((await f.service.app.request(origin+path,{method:'POST',headers:{origin:'https://evil.test','content-type':'application/json',cookie},body:'{}'})).status,403);
  assert.equal((await f.api('/api/me/work-stats/v4')).status,401);
  const publicText=await(await f.api(stats)).text();assert(!/user|visitor|cookie|version-a/.test(publicText));
  f.catalog.length=0;assert.equal((await f.api(stats)).status,404);assert.equal((await f.api(path,cookie,{versionId:'version-a'})).status,404);
 }finally{f.close()}
});
test('reactions require the current account binding, remain private and are included in self export',async()=>{
 const f=await shareHttpFixture();
 const set=async(cookie:string,binding:string,kind:string,enabled:unknown)=>f.service.app.request(origin+'/api/me/work-stats/v4/'+kind,{method:'PUT',headers:{origin,'content-type':'application/json',cookie,'x-wg-binding':binding},body:JSON.stringify({enabled})});
 try{
  const alice=await f.register('Alice'),bob=await f.register('Bob'),a=await(await f.api('/api/me',alice)).json(),b=await(await f.api('/api/me',bob)).json();
  assert.equal((await set(alice,'stale','like',true)).status,409);
  assert.equal((await set(alice,a.binding,'like',true)).status,200);assert.equal((await set(alice,a.binding,'like',true)).status,200);
  await set(alice,a.binding,'favorite',true);assert.deepEqual(await(await f.api('/api/me/favorites',alice)).json(),['v4']);
  assert.deepEqual(await(await f.api('/api/me/work-stats/v4',bob)).json(),{liked:false,favorited:false});
  assert.equal((await set(bob,b.binding,'like','false')).status,400);
  const exported=await(await f.api('/api/me/export',alice)).json();assert.equal(exported.workReactions.length,2);assert(!JSON.stringify(exported.workReactions).includes(b.user.id));
  assert.equal((await f.service.app.request(origin+'/api/me',{method:'DELETE',headers:{origin,'content-type':'application/json',cookie:alice,'x-wg-binding':a.binding},body:JSON.stringify({confirmation:'DELETE'})})).status,200);
  assert.deepEqual(await(await f.api('/api/public/work-stats?ids=v4')).json(),{v4:{reads:0,likes:0,favorites:0}});
 }finally{f.close()}
});
test('a restored database cannot revive reactions removed by a newer independent deletion ledger',async()=>{
 const root=backupRoot('wvn-reaction-restore-'),catalog=[{id:'v4',title:'Story',url:'/4/',versions:[{id:'a',title:'A',number:1,engine:'RenPy',url:'/4/1/'}]}],config={origin,database:join(root,'current.sqlite'),deletionLedger:join(root,'deleted.jsonl'),secret:'s'.repeat(64),catalog};
 const target=await restoreDatabase();
 let s=await createAccountService(config);
 try{
  const ctx=await s.auth.$context,user=await ctx.internalAdapter.createUser({name:'Synthetic',email:'restore@placeholder.invalid',emailVerified:false},{method:'passkey'});
  (await s.workStats.react(user.id,'v4','like',true));(await s.workStats.react(user.id,'v4','favorite',true));
  await createAccountBackup({database:s.config.database,databaseSchema:s.config.databaseSchema,blobRoot:join(root,'blobs'),ledger:config.deletionLedger,destination:join(root,'backup')});s.deletions.record(user.id);
  // 当前库先重放账本，随后恢复旧 PG 快照再验证关系不会复活。
  (await s.deletions.replay(s.db,s.saves));assert.equal((await s.db.prepare('SELECT count(*) AS n FROM wg_work_reactions').get())?.n,0);
  await prepareAccountRestore({backup:join(root,'backup'),currentLedger:config.deletionLedger,destination:join(root,'prepared')});
  const restored=await applyAccountRestore({prepared:join(root,'prepared'),database:target.database});
  (await s.close());s=await createAccountService({...config,...restored});
  assert.deepEqual((await s.workStats.counts(['v4'])).v4,{reads:0,likes:0,favorites:0});(await s.deletions.replay(s.db,s.saves));assert.equal((await s.db.prepare('SELECT count(*) AS n FROM wg_work_reactions').get())?.n,0);
 }finally{(await s.close());await target.close();rmSync(root,{recursive:true,force:true})}
});
