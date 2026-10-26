import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import {SaveStore} from '../src/accounts/saves.server.ts';
test('runtime uploads, lost-response retries and conflicts preserve original head and every revision',async()=>{
 const db=new DatabaseSync(':memory:'),root=mkdtempSync(join(tmpdir(),'wvn-history-')),s=new SaveStore(db,root,()=>1024**4),release='renpy-'+'a'.repeat(64);
 try{
  const old=s.createProfile('a','version'),fresh=s.createProfile('a','version',release);
  async function reserve(p:any,capture:string,expected:string|null,text:string){const bytes=Buffer.from(text);return s.reserve('a',p.id,{captureId:capture,expectedHead:expected,generation:1,files:[{name:'native.dat',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]})}
  async function upload(u:any,text:string){await s.write('a',u.id,u.files[0].id,new Blob([text]).stream());return s.commit('a',u.id)}
  const legacy=await upload(await reserve(old,'old',null,'original'),'original'),before=s.history('a',old.id);
  const u=await reserve(fresh,'new',null,'new'),first=await upload(u,'new');assert.equal((await s.commit('a',u.id)).revision.id,first.revision.id);
  const parallel=await reserve(fresh,'parallel',null,'conflict');assert.equal((await upload(parallel,'conflict')).conflict,true);
  assert.equal(s.profiles('a','version',release)[0].head,first.revision.id);assert.equal(s.history('a',fresh.id).length,2);
  assert.equal(s.profiles('a','version')[0].head,legacy.revision.id);assert.deepEqual(s.history('a',old.id),before);assert.equal((await s.read('a',old.id,legacy.revision.id,'native.dat')).toString(),'original');
 }finally{db.close();rmSync(root,{recursive:true,force:true})}
});
