import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fork} from 'node:child_process';
import {WorkStatsStore,READ_WINDOW_MS,issueReadVisitor,readVisitorKey} from '../src/accounts/work-stats.server.ts';

const catalog=[{id:'v1',title:'One',url:'/1/',versions:[{id:'version-1',number:1,title:'A',engine:'ONS',url:'/1/1/'},{id:'version-2',number:2,title:'B',engine:'RenPy',url:'/1/2/'}]},{id:'v2',title:'Two',url:'/2/',versions:[{id:'version-3',number:1,title:'C',engine:'RenPy',url:'/2/1/'}]}];
const visitor='a'.repeat(64),secret='s'.repeat(64);
test('simultaneous processes share the same SQLite read dedup transaction',async()=>{
 const root=mkdtempSync(join(tmpdir(),'wvn-stats-concurrent-')),file=join(root,'accounts.sqlite'),db=database(file);new WorkStatsStore(db,catalog,()=>1000);
 const children=[1,2].map(()=>fork(new URL('./fixtures/work-stats-worker.mjs',import.meta.url),[file],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']}));
 try{
  const results=children.map(child=>new Promise<{counted:boolean}>((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Concurrent SQLite worker timeout')),15000);let err='';child.stderr?.on('data',s=>{err+=s});
   child.on('message',(value:{type:string;counted:boolean})=>{if(value.type==='result'){clearTimeout(timer);resolve(value)}});child.on('error',reject);child.on('exit',code=>{if(code){clearTimeout(timer);reject(Error(err||'Worker exit '+code))}});
  }));
  await Promise.all(children.map(child=>new Promise<void>(resolve=>child.on('message',(v:{type:string})=>{if(v.type==='ready')resolve()}))));
  children.forEach(c=>c.send('go'));const values=await Promise.all(results);assert.equal(values.filter(v=>v.counted).length,1);assert.equal(new WorkStatsStore(db,catalog,()=>1000).counts(['v1']).v1.reads,1);
 }finally{children.forEach(c=>{if(c.exitCode===null)c.kill()});db.close();rmSync(root,{recursive:true,force:true})}
});
function database(file=':memory:'){
 const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS "user"(id TEXT PRIMARY KEY)');
 db.prepare('INSERT OR IGNORE INTO "user" VALUES (?)').run('alice');db.prepare('INSERT OR IGNORE INTO "user" VALUES (?)').run('bob');return db;
}
test('reads use a rolling thirty-minute window shared by all versions of a work',()=>{
 const db=database();let now=1000;const s=new WorkStatsStore(db,catalog,()=>now);
 try{
  assert.deepEqual(s.counts(['v1','v2']),{v1:{reads:0,likes:0,favorites:0},v2:{reads:0,likes:0,favorites:0}});
  assert.equal(s.read('v1','version-1',visitor).counted,true);
  now+=READ_WINDOW_MS-1;assert.equal(s.read('v1','version-2',visitor).counted,false);
  now++;assert.equal(s.read('v1','version-2',visitor).counted,true);
  assert.equal(s.read('v2','version-3',visitor).counted,true);
  assert.throws(()=>s.read('v1','version-3',visitor));assert.throws(()=>s.read('v1','version-1','forged'));
  assert.equal(s.counts(['v1']).v1.reads,2);assert.throws(()=>s.counts(['unknown']));
 }finally{db.close()}
});
test('separate connections cannot count a replay twice and reactions are target-state idempotent',()=>{
 const root=mkdtempSync(join(tmpdir(),'wvn-stats-')),file=join(root,'accounts.sqlite'),a=database(file),b=database(file),s=new WorkStatsStore(a,catalog,()=>1000),t=new WorkStatsStore(b,catalog,()=>1000);
 try{
  assert.equal(s.read('v1','version-1',visitor).counted,true);assert.equal(t.read('v1','version-2',visitor).counted,false);
  s.react('alice','v1','like',true);t.react('alice','v1','like',true);t.react('bob','v1','favorite',true);
  assert.deepEqual(s.counts(['v1']).v1,{reads:1,likes:1,favorites:1});
  assert.deepEqual(s.mine('alice','v1'),{liked:true,favorited:false});assert.deepEqual(s.mine('bob','v1'),{liked:false,favorited:true});
  s.react('alice','v1','like',false);t.react('alice','v1','like',false);assert.equal(s.counts(['v1']).v1.likes,0);
  assert.throws(()=>s.react('alice','v1','like','false' as never));assert.throws(()=>s.react('alice','v1','share' as never,true));assert.throws(()=>s.react('ghost','v1','like',true));
  assert.deepEqual(s.favorites('bob'),['v1']);a.prepare('DELETE FROM "user" WHERE id=?').run('bob');assert.equal(t.counts(['v1']).v1.favorites,0);
  assert.equal(JSON.stringify(s.counts(['v1'])).includes('alice'),false);
 }finally{a.close();b.close();rmSync(root,{recursive:true,force:true})}
});
test('visitor signatures are site-secret scoped and invalid signatures cannot select stored identities',()=>{
 const cookie=issueReadVisitor(secret);assert.match(cookie,/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
 const key=readVisitorKey(cookie,secret);assert.match(key!,/^[a-f0-9]{64}$/);assert.equal(key,readVisitorKey(cookie,secret));
 assert.equal(readVisitorKey(cookie,'other'.repeat(16)),null);assert.equal(readVisitorKey(cookie+'x',secret),null);assert.equal(readVisitorKey('arbitrary',secret),null);
 assert.notEqual(key,readVisitorKey(issueReadVisitor(secret),secret));
});
test('rate windows are persistent across store instances and expiry permits new requests',()=>{
 const db=database();let now=1000;const a=new WorkStatsStore(db,catalog,()=>now),b=new WorkStatsStore(db,catalog,()=>now);
 try{assert.equal(a.allow('k',2,1000),true);assert.equal(b.allow('k',2,1000),true);assert.equal(a.allow('k',2,1000),false);now+=1000;assert.equal(b.allow('k',2,1000),true)}finally{db.close()}
});
