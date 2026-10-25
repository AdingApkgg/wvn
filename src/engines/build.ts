import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync,openSync,closeSync,lstatSync,readlinkSync,realpathSync,statfsSync,renameSync,rmSync} from 'node:fs';
import {join,resolve,basename} from 'node:path';import{z}from'zod';
import {sha256,releaseIdentity,loadEngineRegistry,type EngineRegistry} from './registry.ts';
import {createJob,updateJob,withBuildLock} from './jobs.ts';import{run,doctor,sdkEnvironment,requireBuildHost}from'./toolchains.ts';
import {buildRenpyEngine,validateRenpyInputs} from './renpy.ts';
const hash=z.string().regex(/^[a-f0-9]{64}$/),safeName=z.string().regex(/^[a-zA-Z0-9_-]+\.(?:js|wasm|data)$/);
const patchesSchema=z.array(z.object({path:z.string().regex(/^engines\/patches\/[a-z0-9.-]+\.patch$/),sha256:hash}).strict());
const commit=z.string().regex(/^[a-f0-9]{40}$/);
const recipeSchema=z.discriminatedUnion('kind',[
 z.object({schema:z.literal(1),id:z.literal('onsyuri'),kind:z.literal('ONS'),sdk:z.string(),source:z.object({url:z.literal('https://github.com/YuriSizuku/OnscripterYuri.git'),commit}).strict(),lua:z.object({url:z.literal('https://www.lua.org/ftp/lua-5.4.4.tar.gz'),sha256:hash}).strict(),patches:patchesSchema,outputs:z.array(safeName).min(2)}).strict(),
 z.object({schema:z.literal(1),id:z.literal('renpy-8.2.1'),kind:z.literal('RenPy'),sdk:z.literal('emsdk-3.1.24-linux-x64'),source:z.object({url:z.literal('https://github.com/renpy/renpy.git'),commit}).strict(),buildSystem:z.object({url:z.literal('https://github.com/renpy/renpy-build.git'),commit}).strict(),pygameSdl2:z.object({url:z.literal('https://github.com/renpy/pygame_sdl2.git'),commit}).strict(),inputs:z.object({path:z.literal('engines/locks/renpy-8.2.1-inputs.json'),sha256:hash}).strict(),patches:patchesSchema.length(0),outputs:z.array(safeName).length(4)}).strict(),
]);
export type Recipe=z.infer<typeof recipeSchema>;
const builderFiles=['src/engines/build.ts','src/engines/toolchains.ts','src/engines/jobs.ts','scripts/engine-manager.ts'];
const renpyBuilderFiles=['src/engines/renpy.ts','src/engines/registry.ts','scripts/lib/renpy-build.py','scripts/lib/renpy_host_python.py','engines/locks/renpy-8.2.1-inputs.json'];
// source.tar 保留上游基线；配方和补丁本体共同组成可重建的实际输入。
export function captureBuildInputs(jobRoot:string,repo:string,recipeBytes:Buffer,sdk:unknown){
 const root=join(jobRoot,'inputs'),files:Record<string,string>={};mkdirSync(root,{mode:0o700});
 function put(path:string,bytes:Buffer){const target=join(root,path);mkdirSync(resolve(target,'..'),{recursive:true,mode:0o700});writeFileSync(target,bytes,{flag:'wx',mode:0o600});files[path]=sha256(bytes);}
 put('recipe.json',recipeBytes);put('toolchain.json',Buffer.from(JSON.stringify(sdk,null,2)));
 for(const path of builderFiles)put(path,readFileSync(join(repo,path)));
 if(JSON.parse(recipeBytes.toString()).kind==='RenPy')for(const path of renpyBuilderFiles)put(path,readFileSync(join(repo,path)));
 const patches=patchesSchema.parse(JSON.parse(recipeBytes.toString()).patches);
 for(const patch of patches){const bytes=readFileSync(join(repo,patch.path));if(sha256(bytes)!==patch.sha256)throw Error('Patch fingerprint differs');put(patch.path,bytes);}
 writeFileSync(join(root,'manifest.json'),JSON.stringify({schema:1,files},null,2),{flag:'wx',mode:0o600});return verifyBuildInputs(jobRoot);
}
export function verifyBuildInputs(jobRoot:string){
 const root=realpathSync(join(jobRoot,'inputs')),value=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
 const manifest=z.object({schema:z.literal(1),files:z.record(z.string(),hash)}).strict().parse(value);
 for(const [path,expected] of Object.entries(manifest.files)){
  if(!['recipe.json','toolchain.json',...builderFiles,...renpyBuilderFiles].includes(path)&&!/^engines\/patches\/[a-z0-9.-]+\.patch$/.test(path))throw Error('Invalid build input path');
  const file=join(root,path);if(!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink()||!realpathSync(file).startsWith(root+'/')||sha256(readFileSync(file))!==expected)throw Error('Build input fingerprint differs');
 }
 for(const path of ['recipe.json','toolchain.json',...builderFiles])if(!manifest.files[path])throw Error('Missing build input');
 const recipe=JSON.parse(readFileSync(join(root,'recipe.json'),'utf8'));
 if(recipe.kind==='RenPy'){
  for(const path of renpyBuilderFiles)if(!manifest.files[path])throw Error('Missing RenPy build input');
  validateRenpyInputs(readFileSync(join(root,recipe.inputs.path)),recipe);
 }
 const patches=patchesSchema.parse(JSON.parse(readFileSync(join(root,'recipe.json'),'utf8')).patches);
 for(const patch of patches)if(manifest.files[patch.path]!==patch.sha256)throw Error('Patch fingerprint differs');return manifest;
}
export function validateRecipe(value:unknown,registry:EngineRegistry):Recipe{const r=recipeSchema.parse(value),required=r.kind==='ONS'?['onsyuri.js','onsyuri.wasm']:['renpy-pre.js','renpy.js','renpy.wasm','renpy.data'];if(!registry.toolchains.some(t=>t.id===r.sdk)||new Set(r.outputs).size!==r.outputs.length||!required.every(n=>r.outputs.includes(n)))throw Error('Unregistered SDK or incomplete outputs');return r;}
export async function verifyArtifacts(root:string,names:string[]){
 const base=realpathSync(root),files=[];
 for(const path of names){if(!safeName.safeParse(path).success)throw Error('Invalid artifact path');const target=join(base,path);if(lstatSync(target).isSymbolicLink()||!lstatSync(target).isFile()||realpathSync(target)!==target)throw Error('Artifact is not a regular file');
  const bytes=readFileSync(target);let wasm:unknown;
  if(path.endsWith('.wasm')){if(!WebAssembly.validate(bytes))throw Error('Invalid WASM artifact');const module=await WebAssembly.compile(bytes);wasm={imports:WebAssembly.Module.imports(module),exports:WebAssembly.Module.exports(module)};}
  files.push({path,sha256:sha256(bytes),bytes:bytes.length,...(wasm?{wasm}:{})});
 }
 return {schema:1,files,id:sha256(JSON.stringify(files.map(({path,sha256})=>({path,sha256}))))};
}
export function compareArtifacts(a:Awaited<ReturnType<typeof verifyArtifacts>>,b:Awaited<ReturnType<typeof verifyArtifacts>>){return {identical:a.id===b.id,first:a.id,second:b.id};}
export function validateAcceptance(proof:unknown,release:{id:string;kind:string},registry:EngineRegistry){
 const required=['artifactIntegrity','startup','nativeSaveLoad','rollback','isolation','cloudHistory'];
 const p=z.object({schema:z.literal(1),status:z.literal('passed'),releaseId:z.literal(release.id),versionIds:z.array(z.string()).min(1),checks:z.record(z.string(),z.boolean())}).passthrough().parse(proof);
 if(new Set(p.versionIds).size!==p.versionIds.length||!p.versionIds.every(id=>{const b=registry.bindings.find(b=>b.versionId===id);return b&&registry.releases.find(r=>r.id===b.releaseId)?.kind===release.kind;})||!required.every(k=>p.checks[k]===true))throw Error('Candidate acceptance is incomplete or belongs to another engine');return p;
}
export async function sourceDigest(root:string){
 const entries=(await run('git',['ls-files','--stage','-z'],{cwd:root})).split('\0').filter(Boolean);
 return sha256(entries.map(entry=>{
  const match=/^(\d+) ([a-f0-9]+) 0\t(.+)$/.exec(entry);if(!match)throw Error('Unmerged source index');
  const [,mode,commit,path]=match;
  const content=mode==='160000'?'gitlink:'+commit:mode==='120000'?sha256(readlinkSync(join(root,path))):sha256(readFileSync(join(root,path)));
  return mode+':'+path+':'+content;
 }).join('\n'));
}

export async function buildEngine({state,sdkRoot,recipePath,repo=process.cwd()}:{state:string;sdkRoot:string;recipePath:string;repo?:string}){
 requireBuildHost();const registry=loadEngineRegistry(repo),recipeBytes=readFileSync(recipePath),recipe=validateRecipe(JSON.parse(recipeBytes.toString()),registry),sdk=registry.toolchains.find(t=>t.id===recipe.sdk)!;
 if(recipe.kind==='RenPy')return buildRenpyEngine({state,sdkRoot,repo,recipe,recipeBytes,sdk,capture:captureBuildInputs,verify:verifyArtifacts});
 return await withBuildLock(state,async()=>{
  const job=createJob(state,recipe.id),log=openSync(join(job.root,'build.log'),'ax',0o600);
  const execute=(cmd:string,args:string[],cwd?:string,env?:NodeJS.ProcessEnv)=>run(cmd,args,{cwd,env,log});
  try{
   const free=statfsSync(state);if(free.bavail*free.bsize<10*1024**3)throw Error('Build requires at least 10 GiB free');
   const sdkReceipt=await doctor(sdk,sdkRoot),inputs=captureBuildInputs(job.root,repo,recipeBytes,sdk);updateJob(job,'fetching',{recipeDigest:sha256(recipeBytes),sdk:sdkReceipt,sourceCommit:recipe.source.commit,builderDigest:sha256(builderFiles.map(n=>inputs.files[n]).join(':')),inputManifestDigest:sha256(JSON.stringify(inputs))});
   const source=join(job.root,'source');await execute('git',['clone','--filter=blob:none','--no-checkout',recipe.source.url,source]);await execute('git',['checkout','--detach',recipe.source.commit],source);
   if((await run('git',['status','--porcelain'],{cwd:source})).trim())throw Error('Dirty source tree');
   for(const patch of recipe.patches){const file=join(job.root,'inputs',patch.path);if(sha256(readFileSync(file))!==patch.sha256)throw Error('Patch fingerprint differs');await execute('git',['apply','--check',file],source);await execute('git',['apply',file],source);}
   const inputDigest=await sourceDigest(source),archive=join(job.root,'lua.tar.gz');await execute('curl',['--fail','--location','--max-time','120',recipe.lua.url,'--output',archive]);if(sha256(readFileSync(archive))!==recipe.lua.sha256)throw Error('Dependency fingerprint differs');
   await execute('tar',['-xzf',archive,'-C',job.root]);
   const env=sdkEnvironment(sdkRoot,join(state,'cache',sdk.id));env.SOURCE_DATE_EPOCH=(await run('git',['show','-s','--format=%ct','HEAD'],{cwd:source})).trim();env.CFLAGS=`-ffile-prefix-map=${job.root}=.`;env.CXXFLAGS=env.CFLAGS;
   updateJob(job,'building',{sourceInputDigest:inputDigest,lua:recipe.lua,patches:recipe.patches});
   const lua=join(job.root,'lua-5.4.4/src'),ports=join(source,'thirdparty/build/arch_wasm');mkdirSync(join(ports,'include'),{recursive:true});mkdirSync(join(ports,'lib'),{recursive:true});
   await execute('make',['-C',lua,'liblua.a','CC=emcc','AR=emar rcu','MYCFLAGS=-O2 -DLUA_USE_POSIX','-j2'],job.root,env);
   copyFileSync(join(lua,'liblua.a'),join(ports,'lib/liblua.a'));for(const name of readdirSync(lua).filter(n=>/\.h(?:pp)?$/.test(n)))copyFileSync(join(lua,name),join(ports,'include',name));
   const output=join(job.root,'output');mkdirSync(output);
   await execute('embuilder',['build','sdl2','sdl2_ttf','sdl2_image','sdl2_mixer','bzip2','ogg','vorbis','mpg123'],job.root,env);
   await execute('emcc',[join(source,'src/onsyuri_web/dummy.c'),'-o',join(output,'dummy.js'),'-sUSE_SDL=2','-sUSE_SDL_IMAGE=2','-sUSE_SDL_MIXER=2','-sSDL2_IMAGE_FORMATS=bmp,png,jpg','-sSDL2_MIXER_FORMATS=ogg,mp3,mid','-sUSE_OGG=1','-sUSE_VORBIS=1','-sUSE_MPG123=1'],job.root,env);
   await execute('emcmake',['cmake','-S',source,'-B',output,'-DCMAKE_BUILD_TYPE=MinSizeRel'],job.root,env);await execute('cmake',['--build',output,'--target','onsyuri','--parallel','2'],job.root,env);
   if(await sourceDigest(source)!==inputDigest)throw Error('Source changed during build');
   const verified=await verifyArtifacts(output,recipe.outputs),release={id:releaseIdentity({kind:'ONS',mode:'factory',files:verified.files}),kind:'ONS',mode:'factory',files:verified.files.map(({path,sha256})=>({path,sha256})),sourceCapability:'source-build',sourceCommit:recipe.source.commit,sdk:sdk.id};
   const artifacts={...verified,release};await execute('git',['archive','--format=tar','--output='+join(job.root,'source.tar'),'HEAD'],source);
   writeFileSync(join(job.root,'artifacts.json'),JSON.stringify(artifacts,null,2),{mode:0o600});
   updateJob(job,'artifact_verified',{releaseId:release.id,compatibility:'unknown',sourceInputDigest:inputDigest});return job;
  }catch(error){updateJob(job,'failed',{errorCode:'BUILD_FAILED',failedStage:job.state,error:String((error as Error).message).slice(0,2000)});throw Object.assign(error as Error,{jobId:job.id});}
  finally{closeSync(log);}
 });
}

export async function exportEngine(jobRoot:string,destination:string){
 const inputs=verifyBuildInputs(jobRoot);
 const recipe=JSON.parse(readFileSync(join(jobRoot,'inputs/recipe.json'),'utf8'));
 const record=JSON.parse(readFileSync(join(jobRoot,'artifacts.json'),'utf8')),actual=await verifyArtifacts(join(jobRoot,'output'),record.files.map((f:{path:string})=>f.path));
 if(actual.id!==record.id||!record.release||releaseIdentity(record.release)!==record.release.id||record.release.files.length!==actual.files.length||record.release.files.some((f:{path:string;sha256:string})=>!actual.files.some(a=>a.path===f.path&&a.sha256===f.sha256)))throw Error('Candidate artifact identity differs');
 const root=resolve(destination);mkdirSync(root,{recursive:true,mode:0o700});
 return await withBuildLock(root,async()=>{
  const target=join(root,record.release.id);if(lstatExists(target))throw Error('Export already exists; immutable artifacts are never overwritten');
  const staging=join(root,'.export-'+randomUUID());mkdirSync(staging,{mode:0o700});
  try{
   for(const file of actual.files)copyFileSync(join(jobRoot,'output',file.path),join(staging,file.path));
   if(recipe.kind==='RenPy'){
    const lock=validateRenpyInputs(readFileSync(join(jobRoot,'inputs',recipe.inputs.path)),recipe);
    for(const [dir,files]of [['sources',lock.sources.map(s=>({path:s.archive,sha256:s.archiveSha256}))],['python-inputs',lock.python.packages.map(p=>({path:p.file,sha256:p.sha256}))]] as const){
     mkdirSync(join(staging,dir));for(const file of files){const path=join(jobRoot,dir,file.path);if(!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink()||sha256(readFileSync(path))!==file.sha256)throw Error('RenPy export dependency fingerprint differs');copyFileSync(path,join(staging,dir,file.path));}
    }
    for(const name of ['LICENSE.renpy.txt','renpy-receipt.json','adapter-overrides.json'])copyFileSync(join(jobRoot,name),join(staging,name));
   }else for(const [source,dest]of [['source.tar','source.tar'],['lua.tar.gz','lua.tar.gz'],['source/LICENSE','LICENSE']])copyFileSync(join(jobRoot,source),join(staging,dest));
   copyFileSync(join(jobRoot,'job.json'),join(staging,'build-receipt.json'));
   for(const path of [...Object.keys(inputs.files),'manifest.json']){const target=join(staging,'inputs',path);mkdirSync(resolve(target,'..'),{recursive:true,mode:0o700});copyFileSync(join(jobRoot,'inputs',path),target);}
   verifyBuildInputs(staging);
   writeFileSync(join(staging,'release.json'),JSON.stringify(record,null,2),{mode:0o600});
   if(lstatExists(target))throw Error('Export already exists');renameSync(staging,target);
   return {release:record.release,root:target,compatibility:'unknown'};
  }catch(error){rmSync(staging,{recursive:true,force:true});throw error;}
 });
}

function lstatExists(path:string){try{lstatSync(path);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}
