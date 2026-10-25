import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
import {createJob,withBuildLock,updateJob} from '../src/engines/jobs.ts';
import {validateRecipe,verifyArtifacts,compareArtifacts} from '../src/engines/build.ts';
import {loadEngineRegistry} from '../src/engines/registry.ts';

test('fixed recipes reject floating SDK/source, path traversal and arbitrary commands',()=>{
 const recipe={schema:1,id:'onsyuri',kind:'ONS',sdk:'emsdk-6.0.10-linux-x64',source:{url:'https://github.com/YuriSizuku/OnscripterYuri.git',commit:'08f744b31cc1907b66a15f0402e62321a131ed81'},lua:{url:'https://www.lua.org/ftp/lua-5.4.4.tar.gz',sha256:'a'.repeat(64)},patches:[],outputs:['onsyuri.js','onsyuri.wasm']};
 validateRecipe(recipe,loadEngineRegistry());
 for(const change of [(r:any)=>r.sdk='latest',(r:any)=>r.source.commit='main',(r:any)=>r.outputs=['../secret'],(r:any)=>r.command='rm -rf /',(r:any)=>r.source.url='file:///etc/passwd']){const r=structuredClone(recipe);change(r);assert.throws(()=>validateRecipe(r,loadEngineRegistry()));}
});
test('build lock is exclusive and failures retain their own immutable job receipt',async()=>{
 const root=mkdtempSync(join(tmpdir(),'wvn-jobs-'));
 try{
  const job=createJob(root,'onsyuri');
  await withBuildLock(root,async()=>{
   await assert.rejects(withBuildLock(root,async()=>{}),/locked/i);
   updateJob(job,'fetching');updateJob(job,'failed',{errorCode:'SOURCE_MISMATCH'});
  });
  assert.equal(JSON.parse(readFileSync(join(job.root,'job.json'),'utf8')).state,'failed');assert.equal(existsSync(join(root,'build.lock')),false);
  assert.throws(()=>updateJob(job,'preview_ready'),/terminal/i);assert.throws(()=>updateJob(job,'created'),/terminal/i);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('artifact verification hashes real bytes, rejects invalid WASM and detects mixed output sets',async()=>{
 const root=mkdtempSync(join(tmpdir(),'wvn-artifacts-'));
 try{
  writeFileSync(join(root,'onsyuri.js'),'function onsyuri(){}');writeFileSync(join(root,'onsyuri.wasm'),'not wasm');
  await assert.rejects(verifyArtifacts(root,['onsyuri.js','onsyuri.wasm']),/WASM/i);
  writeFileSync(join(root,'onsyuri.wasm'),new Uint8Array([0,97,115,109,1,0,0,0]));const a=await verifyArtifacts(root,['onsyuri.js','onsyuri.wasm']);
  assert(compareArtifacts(a,a).identical);writeFileSync(join(root,'onsyuri.js'),'function changed(){}');const b=await verifyArtifacts(root,['onsyuri.js','onsyuri.wasm']);assert.equal(compareArtifacts(a,b).identical,false);
  await assert.rejects(verifyArtifacts(root,['../secret']),/path/i);
 }finally{rmSync(root,{recursive:true,force:true})}
});

test('source fingerprint records pinned gitlinks without reading them as regular files',async()=>{
 const {execFileSync}=await import('node:child_process');const {mkdirSync}=await import('node:fs');const {sourceDigest}=await import('../src/engines/build.ts');
 const root=mkdtempSync(join(tmpdir(),'wvn-source-'));
 try{execFileSync('git',['init','-q',root]);writeFileSync(join(root,'main.c'),'int main(){}');execFileSync('git',['-C',root,'add','main.c']);execFileSync('git',['-C',root,'-c','user.name=QA','-c','user.email=qa@localhost','commit','-qm','fixture']);
 const commit=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();mkdirSync(join(root,'dependency'));execFileSync('git',['-C',root,'update-index','--add','--cacheinfo',`160000,${commit},dependency`]);
 const before=await sourceDigest(root);writeFileSync(join(root,'main.c'),'int main(){return 1;}');assert.notEqual(await sourceDigest(root),before);
 }finally{rmSync(root,{recursive:true,force:true})}
});

test('failed artifact export never publishes a partial release or overwrites an immutable export',async()=>{
 const {exportEngine}=await import('../src/engines/build.ts');const {mkdirSync}=await import('node:fs');const {releaseIdentity}=await import('../src/engines/registry.ts');
 const root=mkdtempSync(join(tmpdir(),'wvn-export-')),job=join(root,'job'),destination=join(root,'store');mkdirSync(join(job,'output'),{recursive:true});
 try{
  writeFileSync(join(job,'output/onsyuri.js'),'function onsyuri(){}');writeFileSync(join(job,'output/onsyuri.wasm'),new Uint8Array([0,97,115,109,1,0,0,0]));
  const artifacts=await verifyArtifacts(join(job,'output'),['onsyuri.js','onsyuri.wasm']),release={id:releaseIdentity({kind:'ONS',mode:'factory',files:artifacts.files}),kind:'ONS',mode:'factory',files:artifacts.files.map(({path,sha256})=>({path,sha256})),sourceCapability:'source-build',sourceCommit:'c'.repeat(40),sdk:'emsdk-6.0.10-linux-x64'};
  writeFileSync(join(job,'artifacts.json'),JSON.stringify({...artifacts,release}));
  await assert.rejects(exportEngine(job,destination));assert.equal(existsSync(join(destination,release.id)),false);
  mkdirSync(join(job,'source'));for(const n of ['source.tar','lua.tar.gz','job.json','source/LICENSE'])writeFileSync(join(job,n),'fixture');
  await exportEngine(job,destination);assert(existsSync(join(destination,release.id,'onsyuri.wasm')));await assert.rejects(exportEngine(job,destination),/exists|immutable/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
