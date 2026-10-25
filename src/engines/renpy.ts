import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync,openSync,closeSync,statfsSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import {sha256,releaseIdentity,type EngineRegistry} from './registry.ts';
import {createJob,updateJob,withBuildLock} from './jobs.ts';
import {run,doctor,sdkEnvironment} from './toolchains.ts';
import type {Recipe,captureBuildInputs,verifyArtifacts} from './build.ts';

export type RenpyRecipe=Extract<Recipe,{kind:'RenPy'}>;
const hash=z.string().regex(/^[a-f0-9]{64}$/),commit=z.string().regex(/^[a-f0-9]{40}$/),name=z.string().regex(/^[A-Za-z0-9_.+-]+$/);
const source=z.object({name:z.enum(['renpy-build','renpy','pygame_sdl2','aom','libyuv','libavif']),url:z.string(),commit,inputDigest:hash,archiveSha256:hash,archive:name}).strict();
const lockSchema=z.object({schema:z.literal(1),version:z.literal('8.2.1.24030407'),sources:z.array(source).length(6),archives:z.array(z.object({path:z.string().regex(/^source\/[A-Za-z0-9_.+-]+\.(?:tgz|tar\.gz|tar\.xz|tar\.bz2)$/),sha256:hash}).strict()).min(1),python:z.object({version:z.literal('3.11.0'),packages:z.array(z.object({name,version:z.string().regex(/^[\d.]+$/),file:name,url:z.string().url().regex(/^https:\/\/files\.pythonhosted\.org\/packages\/[A-Za-z0-9/_.+-]+$/),sha256:hash,kind:z.enum(['bdist_wheel','sdist'])}).strict()).length(22),runtime:z.array(name).length(13)}).strict()}).strict();
export type RenpyInputs=z.infer<typeof lockSchema>;
export const renpySourcePaths=['README.rst','build.py','requirements.txt','renpybuild','tasks','patches','runtime','extensions','tools','source',':(exclude)source/MetalANGLE*'];
const runtime=['future','six','rsa','pyasn1','ecdsa','urllib3','charset-normalizer','certifi','idna','requests','pefile','chardet','websockets'];
export function validateRenpyInputs(bytes:Buffer,recipe:RenpyRecipe):RenpyInputs{
 if(sha256(bytes)!==recipe.inputs.sha256)throw Error('RenPy input fingerprint differs');const lock=lockSchema.parse(JSON.parse(bytes.toString()));
 const expected:Record<string,{url:string;commit:string}>={renpy:recipe.source,'renpy-build':recipe.buildSystem,pygame_sdl2:recipe.pygameSdl2,aom:{url:'https://aomedia.googlesource.com/aom',commit:'bcfe6fbfed315f83ee8a95465c654ee8078dbff9'},libyuv:{url:'https://chromium.googlesource.com/libyuv/libyuv',commit:'331c361581896292fb46c8c6905e41262b7ca95f'},libavif:{url:'https://github.com/AOMediaCodec/libavif.git',commit:'6ab53189045e7a6fe0bd93d14977b2a4f8efa5e9'}};
 if(new Set(lock.sources.map(s=>s.name)).size!==6||lock.sources.some(s=>s.url!==expected[s.name].url||s.commit!==expected[s.name].commit||s.archive!==`${s.name}-${s.commit}.tar`))throw Error('Unexpected RenPy source');
 for(const key of ['name','file'] as const)if(new Set(lock.python.packages.map(p=>p[key])).size!==22)throw Error('Duplicate Python input');
 if(new Set(lock.archives.map(a=>a.path)).size!==lock.archives.length||new Set(lock.python.runtime).size!==13||runtime.some(n=>!lock.python.runtime.includes(n))||lock.python.runtime.some(n=>!lock.python.packages.some(p=>p.name===n)))throw Error('Unexpected RenPy dependency');return lock;
}
function verifiedFile(path:string,hash:string){if(!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink()||sha256(readFileSync(path))!==hash)throw Error('RenPy dependency fingerprint differs: '+path.split('/').pop());}

export async function buildRenpyEngine(options:{state:string;sdkRoot:string;repo:string;recipe:RenpyRecipe;recipeBytes:Buffer;sdk:EngineRegistry['toolchains'][number];capture:typeof captureBuildInputs;verify:typeof verifyArtifacts}){
 const {state,sdkRoot,repo,recipe,recipeBytes,sdk,capture,verify}=options;
 return withBuildLock(state,async()=>{
  const job=createJob(state,recipe.id),log=openSync(join(job.root,'build.log'),'ax',0o600),execute=(cmd:string,args:string[],cwd?:string,env?:NodeJS.ProcessEnv)=>run(cmd,args,{cwd,env,log,timeout:6*60*60*1000});
  try{
   const free=statfsSync(state);if(free.bavail*free.bsize<20*1024**3)throw Error('RenPy build requires at least 20 GiB free');
   const inputs=validateRenpyInputs(readFileSync(join(repo,recipe.inputs.path)),recipe),sdkReceipt=await doctor(sdk,sdkRoot),captured=capture(job.root,repo,recipeBytes,sdk),runner=join(job.root,'inputs/scripts/lib/renpy-build.py');
   updateJob(job,'fetching',{recipeDigest:sha256(recipeBytes),sdk:sdkReceipt,sourceCommit:recipe.source.commit,builderDigest:sha256(JSON.stringify(captured)),inputManifestDigest:sha256(JSON.stringify(captured)),sourceInputDigest:sha256(JSON.stringify(inputs.sources.map(s=>s.inputDigest)))});
   const cache=join(state,'cache/renpy-8.2.1-inputs');mkdirSync(cache,{recursive:true,mode:0o700});mkdirSync(join(cache,'python'),{recursive:true,mode:0o700});
   for(const s of inputs.sources){
    const archive=join(cache,s.archive);
    if(!existsSync(archive)){
     const checkout=join(job.root,'fetch-'+s.name);await execute('git',['-c','http.version=HTTP/1.1','clone','--filter=blob:none','--no-checkout',s.url,checkout]);
     if(s.name==='renpy-build')await execute('git',['sparse-checkout','set','--no-cone',...renpySourcePaths.slice(0,-1), '!source/MetalANGLE*'],checkout);
     await execute('git',['-c','http.version=HTTP/1.1','checkout','--detach',s.commit],checkout);
     const temp=join(job.root,s.archive);await execute('python3',[runner,'archive',checkout,s.name,temp],repo);verifiedFile(temp,s.archiveSha256);renameSync(temp,archive);
    }verifiedFile(archive,s.archiveSha256);
   }
   for(const p of inputs.python.packages){const path=join(cache,'python',p.file);if(!existsSync(path)){const temp=join(job.root,p.file);await execute('curl',['--fail','--location','--proto','=https','--max-time','180',p.url,'--output',temp]);verifiedFile(temp,p.sha256);renameSync(temp,path);}verifiedFile(path,p.sha256);}
   const env=sdkEnvironment(sdkRoot,join(state,'cache',sdk.id));Object.assign(env,{SOURCE_DATE_EPOCH:'1709553600',PYTHONHASHSEED:'0',PYTHONDONTWRITEBYTECODE:'1',EMCC_CORES:'2',BINARYEN_CORES:'2',CMAKE_BUILD_PARALLEL_LEVEL:'2'});
   updateJob(job,'building',{dependencyLockDigest:recipe.inputs.sha256,compatibility:'unknown'});
   await execute('python3',[runner,'build',job.root,cache,sdkRoot,join(state,'cache/renpy-host')],repo,env);
   const artifacts=await verify(join(job.root,'output'),recipe.outputs),release={id:releaseIdentity({kind:'RenPy',mode:'global',files:artifacts.files}),kind:'RenPy',mode:'global',files:artifacts.files.map(({path,sha256})=>({path,sha256})),sourceCapability:'source-build',sourceCommit:recipe.source.commit,sdk:sdk.id};
   for(const s of inputs.sources)verifiedFile(join(cache,s.archive),s.archiveSha256);
   writeFileSync(join(job.root,'artifacts.json'),JSON.stringify({...artifacts,release},null,2),{flag:'wx',mode:0o600});
   updateJob(job,'artifact_verified',{releaseId:release.id,compatibility:'unknown',buildReceipt:JSON.parse(readFileSync(join(job.root,'renpy-receipt.json'),'utf8'))});return job;
  }catch(error){updateJob(job,'failed',{errorCode:'BUILD_FAILED',failedStage:job.state,error:String((error as Error).message).slice(0,2000)});throw Object.assign(error as Error,{jobId:job.id});}finally{closeSync(log);}
 });
}
