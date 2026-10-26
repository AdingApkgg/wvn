import {readFileSync} from 'node:fs';
import {z} from 'zod';
import {loadEngineRegistry,sha256,type EngineRegistry} from './registry.ts';
import {validateCandidate} from './candidate.ts';
const receipt=z.object({path:z.string().min(1),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const document=z.object({schema:z.literal(1),stage:z.enum(['cloud-testing','verified']),release:z.unknown(),bindings:z.array(z.object({versionId:z.string(),legacyReleaseId:z.string(),saveCompatibilityId:z.string()}).strict()).min(1),native:receipt,cloud:receipt.optional()}).strict();
const nativeChecks=['artifactIntegrity','startup','nativeSaveLoad','rollback','isolation'];
const cloudChecks=['exactBytesMtime','historyRetained','originalHeadUnchanged','crossBrowserNativeLoad','browserRestart','rollback'];
type Evidence={native:unknown;cloud?:unknown};
type Receipt={schema?:number;status?:string;releaseId?:string;versionIds?:string[];checks?:Record<string,boolean>;evidence?:{id?:string;versionId:string;candidateSha256?:string;restartSha256?:string;loadedVisibleText?:string;advancedVisibleText?:string;checks?:Record<string,boolean>}[]};
export function validateCloudRuntime(input:unknown,registry:EngineRegistry,mode:string,evidence:Evidence){
 const doc=document.parse(input);
 if(doc.stage==='cloud-testing'&&mode!=='preview')throw Error('Cloud testing runtimes are preview only');
 const candidate=validateCandidate({schema:1,release:doc.release,versionIds:doc.bindings.map(b=>b.versionId),compatibility:'unknown'},registry,'preview');
 if(candidate.release.kind!=='RenPy')throw Error('Cloud runtime family is not supported');
 const native=evidence.native as Receipt,cloud=evidence.cloud as Receipt|undefined;
 const valid=(r:Receipt|undefined)=>r?.schema===1&&r.status==='passed'&&r.releaseId===candidate.release.id&&Array.isArray(r.evidence);
 if(!valid(native)||!nativeChecks.every(k=>native.checks?.[k]===true))throw Error('Bidirectional native proof is incomplete');
 if(doc.stage==='verified'&&(!doc.cloud||!valid(cloud)))throw Error('Cloud proof is incomplete');
 for(const b of doc.bindings){
  const old=registry.bindings.find(x=>x.versionId===b.versionId),proof=native.evidence!.filter(x=>x.versionId===b.versionId);
  if(!old||old.releaseId!==b.legacyReleaseId||old.saveCompatibilityId!==b.saveCompatibilityId||!native.versionIds?.includes(b.versionId)||proof.length!==1||proof[0].id!==old.playerId||!/^([a-f0-9]{64})$/.test(proof[0].candidateSha256??'')||!/^([a-f0-9]{64})$/.test(proof[0].restartSha256??'')||!proof[0].loadedVisibleText||!proof[0].advancedVisibleText||proof[0].loadedVisibleText===proof[0].advancedVisibleText)throw Error('Runtime compatibility binding differs');
  if(doc.stage==='verified'){
   const rows=cloud!.evidence!.filter(x=>x.versionId===b.versionId);
   if(rows.length!==1||!cloudChecks.every(k=>rows[0].checks?.[k]===true))throw Error('Per-version cloud proof is incomplete');
  }
 }
 return {...doc,release:candidate.release};
}
export type CloudRuntime=ReturnType<typeof validateCloudRuntime>;
export function runtimeSession(runtime:CloudRuntime,versionId:string){
 const b=runtime.bindings.find(b=>b.versionId===versionId);if(!b)return null;
 return {engineReleaseId:runtime.release.id,saveCompatibilityId:b.saveCompatibilityId,database:'wvn-engine-releases-v1-'+runtime.release.id,stage:runtime.stage,engineRelease:{id:runtime.release.id,kind:runtime.release.kind,files:runtime.release.files}};
}
const cached=new Map<string,CloudRuntime>();
export function configuredCloudRuntime(){
 const path=process.env.WG_ENGINE_RUNTIME_FILE;if(!path)return null;
 const mode=process.env.WG_DEPLOYMENT_MODE??'preview',key=mode+':'+path;
 if(!cached.has(key)){
  const doc=document.parse(JSON.parse(readFileSync(path,'utf8')));
  const read=(ref:z.infer<typeof receipt>)=>{const bytes=readFileSync(ref.path);if(sha256(bytes)!==ref.sha256)throw Error('Compatibility receipt integrity differs');return JSON.parse(bytes.toString('utf8'))};
  cached.set(key,validateCloudRuntime(doc,loadEngineRegistry(),mode,{native:read(doc.native),...(doc.cloud?{cloud:read(doc.cloud)}:{})}));
 }
 return cached.get(key)!;
}
export function cloudRuntimeForPlayer(playerId:string){
 const runtime=configuredCloudRuntime();if(!runtime)return null;
 const b=loadEngineRegistry().bindings.find(b=>b.playerId===playerId);
 return b&&runtime.bindings.some(x=>x.versionId===b.versionId)?runtime:null;
}
