import{test}from'node:test';import assert from'node:assert/strict';
import{releaseIdentity,loadEngineRegistry}from'../src/engines/registry.ts';
import{validateCandidate,candidateSession}from'../src/engines/candidate.ts';

test('new engine candidates use a separate workspace and cannot enable old cloud writes',()=>{
 const registry=loadEngineRegistry(),files=[{path:'onsyuri.js',sha256:'a'.repeat(64)},{path:'onsyuri.wasm',sha256:'b'.repeat(64)}];
 const release={id:releaseIdentity({kind:'ONS',mode:'factory',files}),kind:'ONS',mode:'factory',files,sourceCapability:'source-build',sourceCommit:'c'.repeat(40),sdk:registry.toolchains[0].id};
 const value={schema:1,release,versionIds:[registry.bindings[0].versionId],compatibility:'unknown'};
 const verified=validateCandidate(value,registry,'preview');assert.throws(()=>validateCandidate(value,registry,'production'),/preview/i);
 const session=candidateSession(verified,registry.bindings[0].versionId)!;assert.equal(session.cloudEnabled,false);assert.match(session.database,/^wvn-engine-candidates-v1-/);assert.notEqual(session.database,'wg-ons-pilot-v1');assert.equal(session.releaseId,release.id);
 assert.equal(candidateSession(verified,registry.bindings[1].versionId),null);
 for(const change of [(v:any)=>v.compatibility='compatible',(v:any)=>v.versionIds=['unknown'],(v:any)=>v.release.files[0].sha256='d'.repeat(64)]){const v=structuredClone(value);change(v);assert.throws(()=>validateCandidate(v,registry,'preview'));}
});
