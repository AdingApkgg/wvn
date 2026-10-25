import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadEngineRegistry} from '../src/engines/registry.ts';
import {validateRecipe} from '../src/engines/build.ts';
const fixture=()=>({schema:1,id:'renpy-8.2.1',kind:'RenPy',sdk:'emsdk-3.1.24-linux-x64',source:{url:'https://github.com/renpy/renpy.git',commit:'1a30d4dd8eb5d0f21ac8550703439db05fde0cc8'},buildSystem:{url:'https://github.com/renpy/renpy-build.git',commit:'992db0ebeef20cf752a29eda9df503377e80e1b2'},pygameSdl2:{url:'https://github.com/renpy/pygame_sdl2.git',commit:'4fadf87b8c3e9d607b97709d3bbf3df6a7fab102'},inputs:{path:'engines/locks/renpy-8.2.1-inputs.json',sha256:'a'.repeat(64)},patches:[],outputs:['renpy-pre.js','renpy.js','renpy.wasm','renpy.data']});
const registry=loadEngineRegistry;
test('RenPy source recipe requires its complete JS/WASM/data group and exact source pins',()=>{
 const r=validateRecipe(fixture(),registry());assert.equal(r.kind,'RenPy');
 for(const change of [(r:any)=>r.source.commit='master',(r:any)=>r.buildSystem.commit='renpy-8.2.1.24030407',(r:any)=>r.pygameSdl2.url='https://example.test/source.git',(r:any)=>r.sdk='emsdk-6.0.10-linux-x64',(r:any)=>r.outputs=r.outputs.filter((x:string)=>!x.endsWith('.data')),(r:any)=>r.outputs.push('worker.js'),(r:any)=>r.outputs.push('renpy.data'),(r:any)=>r.command='make all',(r:any)=>r.inputs.path='../secret']){const value=fixture();change(value);assert.throws(()=>validateRecipe(value,registry()))}
});
test('adding RenPy recipe does not reinterpret old ONS recipe or legacy bindings',()=>{
 const r=loadEngineRegistry(),old=JSON.stringify(r.bindings);assert.equal(validateRecipe(JSON.parse(readFileSync('engines/recipes/onsyuri.json','utf8')),r).kind,'ONS');assert.equal(JSON.stringify(loadEngineRegistry().bindings),old)
});

test('SDK environment handles official EM_CONFIG-relative Node paths without evaluating config',async()=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {sdkEnvironment}=await import('../src/engines/toolchains.ts');const root=mkdtempSync(join(tmpdir(),'wvn-sdk-node-'));
 const declaration="emsdk_path = os.path.dirname(os.getenv('EM_CONFIG')).replace('\\\\', '/')";
 try{
  writeFileSync(join(root,'.emscripten'),declaration+"\nNODE_JS = emsdk_path + '/node/24.19.0_64bit/bin/node'\n");assert(sdkEnvironment(root).PATH?.includes(root+'/node/24.19.0_64bit/bin'));
  writeFileSync(join(root,'.emscripten'),`NODE_JS = '${root}/node/bin/node'\n`);assert(sdkEnvironment(root).PATH?.includes(root+'/node/bin'));
  writeFileSync(join(root,'.emscripten'),declaration+"\nNODE_JS = emsdk_path + '/../external/node'\n");assert.throws(()=>sdkEnvironment(root),/escapes/);
  writeFileSync(join(root,'.emscripten'),"emsdk_path = '/usr'\nNODE_JS = emsdk_path + '/bin/node'\n");assert.throws(()=>sdkEnvironment(root),/Node runtime/);
  writeFileSync(join(root,'.emscripten'),"NODE_JS = some_function()\n");assert.throws(()=>sdkEnvironment(root),/Node runtime/);
 }finally{rmSync(root,{recursive:true,force:true})}
});

test('RenPy dependency lock only admits audited fixed source and hashed package inputs',async()=>{
 const {validateRenpyInputs}=await import('../src/engines/renpy.ts');const lock=JSON.parse(readFileSync('engines/locks/renpy-8.2.1-inputs.json','utf8')),recipe=validateRecipe(JSON.parse(readFileSync('engines/recipes/renpy-8.2.1.json','utf8')),registry());assert.equal(recipe.kind,'RenPy');if(recipe.kind!=='RenPy')return;
 assert.equal(validateRenpyInputs(Buffer.from(JSON.stringify(lock)),{...recipe,inputs:{...recipe.inputs,sha256:(await import('../src/engines/registry.ts')).sha256(JSON.stringify(lock))}}).sources.length,6);
 for(const mutate of [(x:any)=>x.sources[0].commit='main',(x:any)=>x.sources[0].url='https://example.test/repo.git',(x:any)=>x.python.packages[0].url='file:///etc/passwd',(x:any)=>x.python.packages[0].file='../secret',(x:any)=>x.python.runtime.push('unlocked'),(x:any)=>x.sources.push(x.sources[0]),(x:any)=>x.command='curl']){const value=structuredClone(lock);mutate(value);const bytes=Buffer.from(JSON.stringify(value)),r={...recipe,inputs:{...recipe.inputs,sha256:(await import('../src/engines/registry.ts')).sha256(bytes)}};assert.throws(()=>validateRenpyInputs(bytes,r))}
 assert.throws(()=>validateRenpyInputs(Buffer.from('{}'),recipe),/fingerprint/i);
});

test('candidate acceptance rejects duplicate versions and cross-engine evidence',async()=>{
 const {validateAcceptance}=await import('../src/engines/build.ts');const r=registry(),version=r.bindings.find(b=>r.releases.find(x=>x.id===b.releaseId)?.kind==='RenPy')!.versionId,ons=r.bindings.find(b=>r.releases.find(x=>x.id===b.releaseId)?.kind==='ONS')!.versionId;
 const release={id:'renpy-'+'a'.repeat(64),kind:'RenPy'},proof={schema:1,status:'passed',releaseId:release.id,versionIds:[version],checks:Object.fromEntries(['artifactIntegrity','startup','nativeSaveLoad','rollback','isolation','cloudHistory'].map(k=>[k,true]))};validateAcceptance(proof,release,r);
 for(const ids of [[ons],[version,ons],[version,version],[],['unregistered']])assert.throws(()=>validateAcceptance({...proof,versionIds:ids},release,r));
 assert.throws(()=>validateAcceptance({...proof,releaseId:'renpy-'+'b'.repeat(64)},release,r));assert.throws(()=>validateAcceptance({...proof,checks:{...proof.checks,nativeSaveLoad:false}},release,r));
});

test('RenPy jobs expose their registered recipe and release without private build details',async()=>{
 const {jobSummary}=await import('../src/engines/status.ts');const job={id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',root:'/private/build',recipe:'renpy-8.2.1',state:'artifact_verified' as const,history:[{state:'artifact_verified' as const,at:'2026-10-26T01:00:00.000Z'}],details:{releaseId:'renpy-'+'a'.repeat(64),secret:'private',compatibility:'unknown'}};
 const value=jobSummary(job);assert.equal(value.recipe,'renpy-8.2.1');assert.equal(value.releaseId,job.details.releaseId);assert.doesNotMatch(JSON.stringify(value),/private|secret/);
});

test('RenPy input capture requires its actual driver and detects lock tampering',async()=>{
 const {captureBuildInputs,verifyBuildInputs}=await import('../src/engines/build.ts');const {mkdtempSync,rmSync,writeFileSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const root=mkdtempSync(join(tmpdir(),'wvn-renpy-inputs-'));
 try{const recipe=readFileSync('engines/recipes/renpy-8.2.1.json');const value=captureBuildInputs(root,process.cwd(),recipe,registry().toolchains.find(s=>s.version==='3.1.24'));for(const name of ['src/engines/renpy.ts','scripts/lib/renpy-build.py','engines/locks/renpy-8.2.1-inputs.json'])assert(value.files[name]);writeFileSync(join(root,'inputs/engines/locks/renpy-8.2.1-inputs.json'),'{}');assert.throws(()=>verifyBuildInputs(root),/fingerprint/i)}finally{rmSync(root,{recursive:true,force:true})}
});
