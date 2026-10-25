import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {players} from '../../public/player/registry.mjs';

const digest=z.string().regex(/^[a-f0-9]{64}$/);
const path=z.string().regex(/^(?!\.)(?!.*(?:\/\.|\\|[?#:%]))[A-Za-z0-9_./-]+$/);
const file=z.object({path,sha256:digest}).strict();
const release=z.object({id:z.string(),kind:z.enum(['ONS','Artemis','RenPy','Tyrano']),mode:z.enum(['factory','global','javascript']),files:z.array(file).min(1),sourceCapability:z.literal('imported-prebuilt'),sourceCommit:z.null(),sdk:z.null()}).strict();
const binding=z.object({playerId:z.string(),versionId:z.string(),releaseId:z.string(),legacyEngine:digest,saveCompatibilityId:z.string()}).strict();
const toolchain=z.object({id:z.string().regex(/^[a-z0-9.-]+$/),version:z.string().regex(/^\d+\.\d+\.\d+$/),emsdkCommit:z.string().regex(/^[a-f0-9]{40}$/),releaseCommit:z.string().regex(/^[a-f0-9]{40}$/),files:z.array(file).min(1),platform:z.literal('linux-x64')}).strict();
const schema=z.object({schema:z.literal(1),releases:z.array(release),bindings:z.array(binding),toolchains:z.array(toolchain)}).strict();
export type EngineRegistry=z.infer<typeof schema>;
export const sha256=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export function releaseIdentity(value:{kind:string;mode:string;files:{path:string;sha256:string}[]}){
 return value.kind.toLowerCase()+'-'+sha256(JSON.stringify({kind:value.kind,mode:value.mode,files:value.files.map(({path,sha256})=>({path,sha256})).sort((a,b)=>a.path.localeCompare(b.path,'en'))}));
}
export function validateEngineRegistry(input:unknown):EngineRegistry{
 const value=schema.parse(input),releases=new Map(value.releases.map(r=>[r.id,r]));
 if(releases.size!==value.releases.length||new Set(value.toolchains.map(t=>t.id)).size!==value.toolchains.length)throw Error('Duplicate engine or SDK identity');
 for(const r of value.releases){if(releaseIdentity(r)!==r.id||new Set(r.files.map(f=>f.path)).size!==r.files.length)throw Error('Engine manifest identity differs');}
 if(value.bindings.length!==players.length||new Set(value.bindings.map(b=>b.versionId)).size!==players.length)throw Error('Incomplete or duplicate game bindings');
 for(const p of players){
  const b=value.bindings.find(b=>b.versionId===p.versionId),r=b&&releases.get(b.releaseId);
  if(!b||!r||b.playerId!==p.id||b.legacyEngine!==p.engine||b.saveCompatibilityId!==`legacy:${p.versionId}:${p.engine}`)throw Error('Legacy save identity differs');
  const kind='runtimeKind' in p?p.runtimeKind:'ONS';if(r.kind!==kind)throw Error('Mixed engine family');
  const expected=kind==='ONS'?{'onsyuri.js':'334ee32249dce6c8d6cdf7e0c6b68e704129c58efa949336c8fad14742a882c1','onsyuri.wasm':p.engine}:(p as typeof players[number]&{engineFiles:Record<string,string>}).engineFiles;
  if(r.files.length!==Object.keys(expected).length||r.files.some(f=>expected[f.path]!==f.sha256))throw Error('Mixed or incomplete engine artifacts');
 }
 return value;
}
export function loadEngineRegistry(root=process.cwd()):EngineRegistry{
 const read=(name:string)=>{const value=JSON.parse(readFileSync(resolve(root,'engines',name),'utf8'));if(value.schema!==1)throw Error('Unknown engine lock schema');return value;};
 return validateEngineRegistry({schema:1,releases:read('releases.lock.json').releases,bindings:read('bindings.json').bindings,toolchains:read('toolchains.lock.json').toolchains});
}
export function engineSummary(root=process.cwd()){
 const registry=loadEngineRegistry(root);
 return {schema:1,versions:registry.bindings.length,emscriptenVersions:registry.bindings.filter(b=>registry.releases.find(r=>r.id===b.releaseId)?.kind!=='Tyrano').length,toolchains:registry.toolchains.map(({id,version,emsdkCommit})=>({id,version,emsdkCommit})),releases:registry.releases.map(r=>({id:r.id,kind:r.kind,mode:r.mode,files:r.files,sourceCapability:r.sourceCapability,versions:registry.bindings.filter(b=>b.releaseId===r.id).length})),bindings:registry.bindings};
}
