import {test} from 'node:test';
import assert from 'node:assert/strict';
import { testDatabase } from "./helpers/accounts.ts";
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SaveStore} from '../src/accounts/saves.server.ts';
const release='renpy-'+ 'a'.repeat(64);
test('new runtime profiles are independent while legacy queries and rollback index remain unchanged',async ()=>{
 const db=await testDatabase(),root=mkdtempSync(join(tmpdir(),'wvn-scope-'));
 try {
  const saves=new SaveStore(db,root,()=>1024**4),old=(await saves.createProfile('alice','game')),fresh=(await saves.createProfile('alice','game',release));
  assert.notEqual(old.id,fresh.id);assert.equal(fresh.versionId,'game');assert.equal(fresh.engineReleaseId,release);
  assert.equal((await saves.createProfile('alice','game',release)).id,fresh.id);
  assert.deepEqual((await saves.profiles('alice','game')),[old]);assert.deepEqual((await saves.profiles('alice','game',release)),[fresh]);
  assert.equal((await saves.profiles('alice')).length,2);assert.equal((await saves.profiles('bob')).length,0);
  assert.equal((await db.prepare("SELECT id FROM wg_save_profiles WHERE owner=$1 AND version_id=$2 AND deleted=0").get('alice','game'))?.id,old.id);
  assert.doesNotThrow(()=>new SaveStore(db,root,()=>1024**4));
  (await assert.rejects(async ()=>(await saves.createProfile('alice','game','unknown'))));
  for(let i=2;i<200;i++)(await saves.createProfile('alice','other'+i));
  (await assert.rejects(async ()=>(await saves.createProfile('alice','game','renpy-'+'b'.repeat(64))),/PROFILE_LIMIT/));
 }finally{(await db.close());rmSync(root,{recursive:true,force:true})}
});
test('shared runtime snapshots retain writer scope when claimed without changing old recipient head',async()=>{
 const {sharingFixture}=await import('./helpers/sharing.ts'),{ShareClaims}=await import('../src/accounts/share-claims.server.ts');
 const f=await sharingFixture();try{
  const fresh=(await f.saves.createProfile('alice','version-a',release)),old=(await f.saves.createProfile('bob','version-a'));
  const files=f.revision.files,u=await f.saves.reserve('alice',fresh.id,{captureId:'runtime',generation:1,expectedHead:null,files});
  for(const file of u.files)await f.saves.write('alice',u.id,file.id,new Blob([f.content]).stream());
  const revision=(await f.saves.commit('alice',u.id)).revision;
  const share=await f.shares.create('alice',{...f.input,requestId:'runtime',profileId:fresh.id,revisionId:revision.id});
  assert.equal((await f.shares.inspect(share.id,share.secret)).version.engineReleaseId,release);
  const result=await new ShareClaims(f.shares).claim('bob',()=>{}, {shareId:share.id,secret:share.secret,requestId:'receive'});
  assert.equal(result.profile.engineReleaseId,release);assert.notEqual(result.profile.id,old.id);
  assert.deepEqual((await f.saves.profiles('bob','version-a')),[old]);assert.equal((await f.saves.history('bob',old.id)).length,0);
 }finally{(await f.close())}
});
