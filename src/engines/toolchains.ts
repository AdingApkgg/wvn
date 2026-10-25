import {readFileSync,realpathSync,mkdirSync,existsSync,renameSync,openSync,closeSync,writeSync} from 'node:fs';
import {join,delimiter,resolve} from 'node:path';import {hostname} from 'node:os';import {spawn} from 'node:child_process';
import {sha256,type EngineRegistry} from './registry.ts';
import {createJob,updateJob,withBuildLock} from './jobs.ts';
export type Toolchain=EngineRegistry['toolchains'][number];
export async function run(command:string,args:string[],options:{cwd?:string;env?:NodeJS.ProcessEnv;log?:number;timeout?:number}={}):Promise<string>{
 return await new Promise((yes,no)=>{let out='';const child=spawn(command,args,{cwd:options.cwd,env:options.env??process.env,stdio:['ignore',options.log??'pipe',options.log??'pipe']});
 const capture=(data:Buffer)=>{if(out.length<1024*1024)out+=data.toString()};child.stdout?.on('data',capture);child.stderr?.on('data',capture);
 const timer=setTimeout(()=>{child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),5000).unref();},options.timeout??60*60*1000);timer.unref();
 child.on('error',e=>{clearTimeout(timer);no(e)});child.on('close',(code,signal)=>{clearTimeout(timer);code===0?yes(out):no(Error(`${command.split('/').pop()} exited ${code??signal}: ${out.slice(-1800)}`))});
 });
}
export function requireBuildHost(){if(process.platform!=='linux'||process.arch!=='x64'||hostname()!=='localhost')throw Error('Engine builds require the registered Linux1 build host');}
export function sdkEnvironment(sdkRoot:string,cache?:string):NodeJS.ProcessEnv{
 const root=realpathSync(sdkRoot),config=readFileSync(join(root,'.emscripten'),'utf8');
 const match=/^NODE_JS\s*=\s*['"]([^'"]+)['"]/m.exec(config);if(!match)throw Error('Pinned SDK Node runtime is missing');
 const node=resolve(match[1].replace('$CFGDIR',root));if(!node.startsWith(root+'/'))throw Error('SDK Node escapes its prefix');
 return {...process.env,EMSDK:root,EM_CONFIG:join(root,'.emscripten'),...(cache?{EM_CACHE:cache}:{}),PATH:[join(root,'upstream/emscripten'),join(root,'upstream/bin'),resolve(node,'..'),process.env.PATH].join(delimiter)};
}
export function inspectCompilerOutput(output:string){
 const lines=output.split(/\r?\n/).map(line=>({line,match:/^emcc \(.+\) (\d+\.\d+\.\d+)(?: |$)/.exec(line)})).filter(x=>x.match);
 if(!lines.length||new Set(lines.map(x=>x.match![1])).size!==1)throw Error('Compiler version output is missing or ambiguous');
 return {version:lines[0].match![1],line:lines[0].line};
}
export async function doctor(sdk:Toolchain,sdkRoot:string){
 const root=realpathSync(sdkRoot);
 for(const f of sdk.files)if(sha256(readFileSync(join(root,f.path)))!==f.sha256)throw Error('SDK fingerprint differs: '+f.path);
 const commit=(await run('git',['-C',root,'rev-parse','HEAD'],{timeout:10000})).trim();if(commit!==sdk.emsdkCommit)throw Error('emsdk revision differs');
 const tags=JSON.parse(readFileSync(join(root,'emscripten-releases-tags.json'),'utf8'));if(tags.releases[sdk.version]!==sdk.releaseCommit)throw Error('SDK release mapping differs');
 const env=sdkEnvironment(root),version=await run(join(root,'upstream/emscripten/emcc'),['--version'],{env,timeout:30000});
 const compiler=inspectCompilerOutput(version);if(compiler.version!==sdk.version)throw Error('Compiler version differs');
 return {status:'verified',id:sdk.id,version:sdk.version,emsdkCommit:commit,compiler:compiler.line,host:hostname(),proxyConfigured:!!(process.env.HTTPS_PROXY||process.env.https_proxy)};
}
export async function installSdk(sdk:Toolchain,state:string,options:{resume?:boolean;log?:number;building?:()=>void}={}){
 requireBuildHost();if(!(process.env.https_proxy||process.env.HTTPS_PROXY))throw Error('Build host proxy is required');
 const execute=(command:string,args:string[],cwd?:string)=>run(command,args,{cwd,log:options.log});
 const root=join(state,'toolchains',sdk.id);if(existsSync(root)){options.building?.();return await doctor(sdk,root);}
 mkdirSync(join(state,'toolchains'),{recursive:true,mode:0o700});const candidate=root+'.installing';if(existsSync(candidate)){if(!options.resume)throw Error('Previous SDK installation requires inspection; use explicit --resume after inspection');options.building?.();await doctor(sdk,candidate);renameSync(candidate,root);return await doctor(sdk,root);}
 await execute('git',['clone','--filter=blob:none','--no-checkout','https://github.com/emscripten-core/emsdk.git',candidate]);
 await execute('git',['-C',candidate,'checkout','--detach',sdk.emsdkCommit]);
 for(const f of sdk.files.filter(f=>!f.path.startsWith('upstream/')))if(sha256(readFileSync(join(candidate,f.path)))!==f.sha256)throw Error('SDK bootstrap fingerprint differs');
 options.building?.();await execute(join(candidate,'emsdk'),['install',sdk.version],candidate);await execute(join(candidate,'emsdk'),['activate',sdk.version],candidate);
 await doctor(sdk,candidate);renameSync(candidate,root);return await doctor(sdk,root);
}

export async function installSdkJob(sdk:Toolchain,state:string,options:{resume?:boolean}={}){
 return withBuildLock(state,async()=>{
  const job=createJob(state,'emsdk-install'),log=openSync(join(job.root,'build.log'),'ax',0o600);
  try{
   updateJob(job,'fetching',{toolchainId:sdk.id});
   const receipt=await installSdk(sdk,state,{...options,log,building:()=>{if(job.state==='fetching')updateJob(job,'building');}});
   updateJob(job,'artifact_verified',{sdk:receipt});return {jobId:job.id,...receipt};
  }catch(error){writeSync(log,String((error as Error).message)+'\n');updateJob(job,'failed',{errorCode:'SDK_INSTALL_FAILED',failedStage:job.state,error:String((error as Error).message).slice(0,2000)});throw Object.assign(error as Error,{jobId:job.id});}
  finally{closeSync(log);}
 });
}
