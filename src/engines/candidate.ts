import{readFileSync}from'node:fs';import{z}from'zod';import{loadEngineRegistry,releaseIdentity,type EngineRegistry}from'./registry.ts';
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const schema=z.object({schema:z.literal(1),release:z.object({id:z.string(),kind:z.literal('ONS'),mode:z.literal('factory'),files:z.array(z.object({path:z.enum(['onsyuri.js','onsyuri.wasm']),sha256:hash}).strict()).length(2),sourceCapability:z.literal('source-build'),sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sdk:z.string()}).strict(),versionIds:z.array(z.string()).min(1),compatibility:z.literal('unknown')}).strict();
export type Candidate=z.infer<typeof schema>;
export function validateCandidate(input:unknown,registry:EngineRegistry,mode:string):Candidate{
 if(mode!=='preview')throw Error('Engine candidates are preview only');const c=schema.parse(input);
 if(releaseIdentity(c.release)!==c.release.id||new Set(c.release.files.map(f=>f.path)).size!==2||!registry.toolchains.some(t=>t.id===c.release.sdk)||new Set(c.versionIds).size!==c.versionIds.length)throw Error('Candidate release identity differs');
 if(c.versionIds.some(id=>{const b=registry.bindings.find(b=>b.versionId===id);return !b||registry.releases.find(r=>r.id===b.releaseId)?.kind!=='ONS';}))throw Error('Candidate version is not registered for this engine');return c;
}
export function candidateSession(candidate:Candidate,versionId:string){
 if(!candidate.versionIds.includes(versionId))return null;
 return {releaseId:candidate.release.id,database:'wvn-engine-candidates-v1-'+candidate.release.id,cloudEnabled:false as const,compatibility:'unknown' as const};
}
const cached=new Map<string,Candidate>();
export function configuredCandidate(){
 const file=process.env.WG_ENGINE_CANDIDATE_FILE;if(!file)return null;
 const mode=process.env.WG_DEPLOYMENT_MODE??'preview';if(mode!=='preview')throw Error('Engine candidates are preview only');
 if(!cached.has(file))cached.set(file,validateCandidate(JSON.parse(readFileSync(file,'utf8')),loadEngineRegistry(),mode));return cached.get(file)!;
}
export function candidateForPlayer(playerId:string){const candidate=configuredCandidate();if(!candidate)return null;const binding=loadEngineRegistry().bindings.find(b=>b.playerId===playerId);return binding&&candidate.versionIds.includes(binding.versionId)?candidate:null;}
