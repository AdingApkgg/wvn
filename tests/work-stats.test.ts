import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase,testUser,testDatabaseSchema} from './helpers/accounts.ts';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fork} from 'node:child_process';
import {WorkStatsStore,READ_WINDOW_MS,issueReadVisitor,readVisitorKey} from '../src/accounts/work-stats.server.ts';

const catalog=[{id:'v1',title:'One',url:'/1/',versions:[{id:'version-1',number:1,title:'A',engine:'ONS',url:'/1/1/'},{id:'version-2',number:2,title:'B',engine:'RenPy',url:'/1/2/'}]},{id:'v2',title:'Two',url:'/2/',versions:[{id:'version-3',number:1,title:'C',engine:'RenPy',url:'/2/1/'}]}];
const visitor='a'.repeat(64),secret='s'.repeat(64);
test('simultaneous processes share the same PostgreSQL read dedup transaction',async()=>{
 const root=mkdtempSync(join(tmpdir(),'wvn-stats-concurrent-')),file=join(root,'accounts.sqlite'),db=(await database(file));new WorkStatsStore(db,catalog,()=>1000);
 const children=[1,2].map(()=>fork(new URL('./fixtures/work-stats-worker.mjs',import.meta.url),[file],{execArgv:['--import','tsx'],env:{...process.env,WVN_TEST_SCHEMA:testDatabaseSchema(db)},stdio:['ignore','ignore','pipe','ipc']}));
 try{
  const results=children.map(child=>new Promise<{counted:boolean}>((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Concurrent PostgreSQL worker timeout')),15000);let err='';child.stderr?.on('data',s=>{err+=s});
   child.on('message',(value:{type:string;counted:boolean})=>{if(value.type==='result'){clearTimeout(timer);resolve(value)}});child.on('error',reject);child.on('exit',code=>{if(code){clearTimeout(timer);reject(Error(err||'Worker exit '+code))}});
  }));
  await Promise.all(children.map(child=>new Promise<void>(resolve=>child.on('message',(v:{type:string})=>{if(v.type==='ready')resolve()}))));
  children.forEach(c=>c.send('go'));const values=await Promise.all(results);assert.equal(values.filter(v=>v.counted).length,1);assert.equal((await new WorkStatsStore(db,catalog,()=>1000).counts(['v1'])).v1.reads,1);
 }finally{children.forEach(c=>{if(c.exitCode===null)c.kill()});(await db.close());rmSync(root,{recursive:true,force:true})}
});
async function database(file=':memory:'){
 const db=await testDatabase(file);
 await testUser(db,'alice');await testUser(db,'bob');return db;
}

test('reads use a rolling thirty-minute window shared by all versions of a work',async ()=>{
 const db=(await database());let now=1000;const s=new WorkStatsStore(db,catalog,()=>now);
 try{
  assert.deepEqual((await s.counts(['v1','v2'])),{v1:{reads:0,likes:0,favorites:0},v2:{reads:0,likes:0,favorites:0}});
  assert.equal((await s.read('v1','version-1',visitor)).counted,true);
  now+=READ_WINDOW_MS-1;assert.equal((await s.read('v1','version-2',visitor)).counted,false);
  now++;assert.equal((await s.read('v1','version-2',visitor)).counted,true);
  assert.equal((await s.read('v2','version-3',visitor)).counted,true);
  (await assert.rejects(async ()=>(await s.read('v1','version-3',visitor))));(await assert.rejects(async ()=>(await s.read('v1','version-1','forged'))));
  assert.equal((await s.counts(['v1'])).v1.reads,2);(await assert.rejects(async ()=>(await s.counts(['unknown']))));
 }finally{(await db.close())}
});
test('separate connections cannot count a replay twice and reactions are target-state idempotent',async ()=>{
 const root=mkdtempSync(join(tmpdir(),'wvn-stats-')),file=join(root,'accounts.sqlite'),a=(await database(file)),b=(await database(file)),s=new WorkStatsStore(a,catalog,()=>1000),t=new WorkStatsStore(b,catalog,()=>1000);
 try{
  assert.equal((await s.read('v1','version-1',visitor)).counted,true);assert.equal((await t.read('v1','version-2',visitor)).counted,false);
  (await s.react('alice','v1','like',true));(await t.react('alice','v1','like',true));(await t.react('bob','v1','favorite',true));
  assert.deepEqual((await s.counts(['v1'])).v1,{reads:1,likes:1,favorites:1});
  assert.deepEqual((await s.mine('alice','v1')),{liked:true,favorited:false});assert.deepEqual((await s.mine('bob','v1')),{liked:false,favorited:true});
  (await s.react('alice','v1','like',false));(await t.react('alice','v1','like',false));assert.equal((await s.counts(['v1'])).v1.likes,0);
  (await assert.rejects(async ()=>(await s.react('alice','v1','like','false' as never))));(await assert.rejects(async ()=>(await s.react('alice','v1','share' as never,true))));(await assert.rejects(async ()=>(await s.react('ghost','v1','like',true))));
  assert.deepEqual((await s.favorites('bob')),['v1']);(await a.prepare("DELETE FROM \"user\" WHERE id=$1").run('bob'));assert.equal((await t.counts(['v1'])).v1.favorites,0);
  assert.equal(JSON.stringify((await s.counts(['v1']))).includes('alice'),false);
 }finally{(await a.close());(await b.close());rmSync(root,{recursive:true,force:true})}
});
test('visitor signatures are site-secret scoped and invalid signatures cannot select stored identities',()=>{
 const cookie=issueReadVisitor(secret);assert.match(cookie,/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
 const key=readVisitorKey(cookie,secret);assert.match(key!,/^[a-f0-9]{64}$/);assert.equal(key,readVisitorKey(cookie,secret));
 assert.equal(readVisitorKey(cookie,'other'.repeat(16)),null);assert.equal(readVisitorKey(cookie+'x',secret),null);assert.equal(readVisitorKey('arbitrary',secret),null);
 assert.notEqual(key,readVisitorKey(issueReadVisitor(secret),secret));
});
test('rate windows are persistent across store instances and expiry permits new requests',async ()=>{
 const db=(await database());let now=1000;const a=new WorkStatsStore(db,catalog,()=>now),b=new WorkStatsStore(db,catalog,()=>now);
 try{assert.equal((await a.allow('k',2,1000)),true);assert.equal((await b.allow('k',2,1000)),true);assert.equal((await a.allow('k',2,1000)),false);now+=1000;assert.equal((await b.allow('k',2,1000)),true)}finally{(await db.close())}
});
