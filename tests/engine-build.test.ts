import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';import{tmpdir,hostname}from'node:os';import{join}from'node:path';
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
  const {captureBuildInputs}=await import('../src/engines/build.ts');captureBuildInputs(job,process.cwd(),readFileSync('engines/recipes/onsyuri.json'),loadEngineRegistry().toolchains[0]);
  mkdirSync(join(job,'source'));for(const n of ['source.tar','lua.tar.gz','job.json','source/LICENSE'])writeFileSync(join(job,n),'fixture');
  await exportEngine(job,destination);assert(existsSync(join(destination,release.id,'inputs/manifest.json')));assert(existsSync(join(destination,release.id,'onsyuri.wasm')));await assert.rejects(exportEngine(job,destination),/exists|immutable/);
 }finally{rmSync(root,{recursive:true,force:true})}
});

test('compiler version detection tolerates initial cache notices and rejects ambiguous versions',async()=>{
 const {inspectCompilerOutput}=await import('../src/engines/toolchains.ts');
 const actual='emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.10 (d6c521a7)';
 assert.equal(inspectCompilerOutput('cache:INFO: preparing cache\n'+actual+'\nCopyright').version,'6.0.10');
 assert.throws(()=>inspectCompilerOutput('cache:INFO only'),/version/i);assert.throws(()=>inspectCompilerOutput(actual+'\n'+actual.replace('6.0.10','6.0.11')),/version/i);
});

test('SDK installation failures remain visible as immutable jobs with a private log',async()=>{
 const {installSdkJob}=await import('../src/engines/toolchains.ts');const {mkdirSync,readdirSync}=await import('node:fs');const {buildStatus}=await import('../src/engines/status.ts');
 const state=mkdtempSync(join(tmpdir(),'wvn-install-receipt-')),sdk=loadEngineRegistry().toolchains[0];
 try{
  mkdirSync(join(state,'toolchains',sdk.id+'.installing'),{recursive:true});
  const expected=hostname()==='localhost'?/inspection/i:/registered Linux1 build host/i;
  await assert.rejects(installSdkJob(sdk,state),expected);
  const ids=readdirSync(join(state,'jobs'));assert.equal(ids.length,1);const job=JSON.parse(readFileSync(join(state,'jobs',ids[0],'job.json'),'utf8'));
  assert.equal(job.recipe,'emsdk-install');assert.equal(job.state,'failed');assert.equal(job.details.failedStage,'fetching');assert(existsSync(join(job.root,'build.log')));assert.match(readFileSync(join(job.root,'build.log'),'utf8'),expected);
  const summary=buildStatus(state).jobs[0];assert.equal(summary.recipe,'emsdk-install');assert.equal(summary.errorCode,'SDK_INSTALL_FAILED');assert.doesNotMatch(JSON.stringify(summary),new RegExp(state));
 }finally{rmSync(state,{recursive:true,force:true})}
});

test('export retains exact patch and recipe inputs and rejects missing or modified build inputs',async()=>{
 const {captureBuildInputs,verifyBuildInputs}=await import('../src/engines/build.ts');const {mkdirSync}=await import('node:fs');const {sha256}=await import('../src/engines/registry.ts');
 const root=mkdtempSync(join(tmpdir(),'wvn-patch-inputs-')),repo=join(root,'repo'),job=join(root,'job');
 try{
  mkdirSync(join(repo,'engines/patches'),{recursive:true});mkdirSync(job);for(const n of ['src/engines','scripts'])mkdirSync(join(repo,n),{recursive:true});
  for(const n of ['src/engines/build.ts','src/engines/toolchains.ts','src/engines/jobs.ts','scripts/engine-manager.ts'])writeFileSync(join(repo,n),'source '+n);
  const patch='diff --git a/main.c b/main.c\n--- a/main.c\n+++ b/main.c\n@@ -1 +1 @@\n-old\n+new\n';writeFileSync(join(repo,'engines/patches/fix.patch'),patch);
  const recipe={patches:[{path:'engines/patches/fix.patch',sha256:sha256(patch)}]},bytes=Buffer.from(JSON.stringify(recipe));
  captureBuildInputs(job,repo,bytes,loadEngineRegistry().toolchains[0]);
  assert.equal(readFileSync(join(job,'inputs/engines/patches/fix.patch'),'utf8'),patch);assert.deepEqual(readFileSync(join(job,'inputs/recipe.json')),bytes);verifyBuildInputs(job);
  writeFileSync(join(job,'inputs/engines/patches/fix.patch'),'changed');assert.throws(()=>verifyBuildInputs(job),/fingerprint/i);
  rmSync(join(job,'inputs/engines/patches/fix.patch'));assert.throws(()=>verifyBuildInputs(job));
 }finally{rmSync(root,{recursive:true,force:true})}
});
