import {test} from 'node:test';import assert from 'node:assert/strict';
import {loadEngineRegistry,releaseIdentity} from '../src/engines/registry.ts';
import {validateCloudRuntime,runtimeSession} from '../src/engines/cloud-runtime.ts';
const registry=loadEngineRegistry(),binding=registry.bindings.find(b=>registry.releases.find(r=>r.id===b.releaseId)?.kind==='RenPy')!;
const files=['renpy-pre.js','renpy.js','renpy.wasm','renpy.data'].map((path,i)=>({path,sha256:String(i+1).repeat(64)}));
const release={id:releaseIdentity({kind:'RenPy',mode:'global',files}),kind:'RenPy',mode:'global',files,sourceCapability:'source-build',sourceCommit:'c'.repeat(40),sdk:'emsdk-3.1.24-linux-x64'};
const input={schema:1,stage:'cloud-testing',release,bindings:[{versionId:binding.versionId,legacyReleaseId:binding.releaseId,saveCompatibilityId:binding.saveCompatibilityId}],native:{path:'/private/native.json',sha256:'a'.repeat(64)}};
const native={schema:1,status:'passed',releaseId:release.id,versionIds:[binding.versionId],checks:{artifactIntegrity:true,startup:true,nativeSaveLoad:true,rollback:true,isolation:true},evidence:[{id:binding.playerId,versionId:binding.versionId,candidateSha256:'a'.repeat(64),restartSha256:'b'.repeat(64),loadedVisibleText:'正文A',advancedVisibleText:'正文B'}]};
test('only registered bidirectional evidence enables an isolated testing cloud runtime',()=>{
 const c=validateCloudRuntime(input,registry,'preview',{native});const session=runtimeSession(c,binding.versionId)!;
 assert.equal(session.engineReleaseId,release.id);assert.equal(session.database,'wvn-engine-releases-v1-'+release.id);assert.equal(session.saveCompatibilityId,binding.saveCompatibilityId);
 assert.throws(()=>validateCloudRuntime(input,registry,'production',{native}));
 for(const change of [(x:any)=>x.bindings[0].legacyReleaseId='bad',(x:any)=>x.bindings[0].saveCompatibilityId='bad',(x:any)=>x.release.files.pop()]){const v=structuredClone(input);change(v);assert.throws(()=>validateCloudRuntime(v,registry,'preview',{native}));}
 assert.throws(()=>validateCloudRuntime(input,registry,'preview',{native:{...native,checks:{...native.checks,rollback:false}}}));
});
test('production requires every registered version to have complete cloud and native proof',()=>{
 const v={...input,stage:'verified',cloud:{path:'/private/cloud.json',sha256:'b'.repeat(64)}};
 const checks={exactBytesMtime:true,historyRetained:true,originalHeadUnchanged:true,crossBrowserNativeLoad:true,browserRestart:true,rollback:true};
 const cloud={schema:1,status:'passed',releaseId:release.id,evidence:[{versionId:binding.versionId,checks}]};
 assert.doesNotThrow(()=>validateCloudRuntime(v,registry,'production',{native,cloud}));
 for(const cloudProof of [{...cloud,evidence:[]},{...cloud,evidence:[{versionId:binding.versionId,checks:{...checks,crossBrowserNativeLoad:false}}]}])assert.throws(()=>validateCloudRuntime(v,registry,'production',{native,cloud:cloudProof}));
 assert.throws(()=>validateCloudRuntime(v,registry,'production',{native}));
});
