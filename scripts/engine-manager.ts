import{buildStatus}from'../src/engines/status.ts';
import {parseArgs} from 'node:util';import{resolve,join}from'node:path';import{readFileSync,writeFileSync}from'node:fs';
import {loadEngineRegistry,engineSummary,sha256} from '../src/engines/registry.ts';
import{doctor,installSdkJob}from'../src/engines/toolchains.ts';
import{exportEngine,buildEngine,validateRecipe,verifyArtifacts,compareArtifacts}from'../src/engines/build.ts';
import{readJob,updateJob,withBuildLock}from'../src/engines/jobs.ts';

const {values,positionals}=parseArgs({allowPositionals:true,options:{state:{type:'string'},sdk:{type:'string'},'sdk-root':{type:'string'},recipe:{type:'string'},job:{type:'string'},other:{type:'string'},evidence:{type:'string'},destination:{type:'string'},resume:{type:'boolean'}}});
const command=positionals[0],registry=loadEngineRegistry(),state=values.state?resolve(values.state):undefined;
const requireState=()=>{if(!state)throw Error('Explicit --state is required');return state;};
const jobRoot=(id:string|undefined)=>{if(!id||!/^[a-f0-9-]{36}$/.test(id))throw Error('Explicit job UUID is required');return join(requireState(),'jobs',id);};
const sdk=registry.toolchains.find(s=>s.id===(values.sdk??registry.toolchains[0]?.id));
try{
 let result:unknown;
 switch(command){
  case 'list':result={...engineSummary(),...(state?{status:buildStatus(state)}:{})};break;
  case 'status':result=buildStatus(requireState());break;
  case 'doctor':if(!sdk||!values['sdk-root'])throw Error('Registered SDK and --sdk-root are required');result=await doctor(sdk,resolve(values['sdk-root']));break;
  case 'install':if(!sdk)throw Error('Unknown SDK');result=await installSdkJob(sdk,requireState(),{resume:values.resume});break;
  case 'build':{
   if(!values.recipe||!/^[-a-z0-9]+$/.test(values.recipe))throw Error('Registered --recipe is required');if(!values['sdk-root'])throw Error('--sdk-root is required');
   const path=resolve('engines/recipes',values.recipe+'.json');validateRecipe(JSON.parse(readFileSync(path,'utf8')),registry);
   result=await buildEngine({state:requireState(),sdkRoot:resolve(values['sdk-root']),recipePath:path});break;
  }
  case 'export':if(!values.destination)throw Error('Explicit --destination is required');result=await exportEngine(jobRoot(values.job),resolve(values.destination));break;
  case 'verify':{
   const root=jobRoot(values.job),record=JSON.parse(readFileSync(join(root,'artifacts.json'),'utf8')),current=await verifyArtifacts(join(root,'output'),record.files.map((f:{path:string})=>f.path));if(current.id!==record.id)throw Error('Artifact fingerprint differs');result=current;break;
  }
  case 'compare':{
   const roots=[jobRoot(values.job),jobRoot(values.other)],jobs=roots.map(readJob),artifacts=[];
   for(const [i,root]of roots.entries()){
    const expected=JSON.parse(readFileSync(join(root,'artifacts.json'),'utf8')),actual=await verifyArtifacts(join(root,'output'),expected.files.map((f:{path:string})=>f.path));if(actual.id!==expected.id)throw Error('Artifact fingerprint differs');artifacts.push(actual);
   }
   if(jobs[0].details.builderDigest!==jobs[1].details.builderDigest||jobs[0].details.recipeDigest!==jobs[1].details.recipeDigest||jobs[0].details.sourceInputDigest!==jobs[1].details.sourceInputDigest)throw Error('Build inputs differ');
   result=compareArtifacts(artifacts[0],artifacts[1]);break;
  }
  case 'accept':{
   const root=jobRoot(values.job),job=readJob(root);if(job.state!=='artifact_verified')throw Error('Only verified candidate artifacts can enter acceptance');if(!values.evidence)throw Error('Explicit acceptance evidence is required');
   const bytes=readFileSync(resolve(values.evidence)),proof=JSON.parse(bytes.toString()),required=['artifactIntegrity','startup','nativeSaveLoad','rollback','isolation','cloudHistory'];
   if(proof.schema!==1||proof.status!=='passed'||proof.releaseId!==job.details.releaseId||!Array.isArray(proof.versionIds)||!proof.versionIds.length||!proof.versionIds.every((id:string)=>registry.bindings.some(b=>b.versionId===id))||!required.every(k=>proof.checks?.[k]===true))throw Error('Candidate acceptance is incomplete or belongs to another release');
   const expected=JSON.parse(readFileSync(join(root,'artifacts.json'),'utf8')),actual=await verifyArtifacts(join(root,'output'),expected.files.map((f:{path:string})=>f.path));if(actual.id!==expected.id)throw Error('Artifact fingerprint differs');
   writeFileSync(join(root,'acceptance.json'),bytes,{flag:'wx',mode:0o600});updateJob(job,'testing',{evidenceDigest:sha256(bytes),testedVersionIds:proof.versionIds});updateJob(job,'preview_ready');result={status:'preview_ready',jobId:job.id,releaseId:job.details.releaseId,testedVersionIds:proof.versionIds,productionChanged:false};break;
  }
  default:throw Error('Use list, doctor, install, build, verify, compare or accept; production deployment is intentionally separate');
 }
 console.log(JSON.stringify(result,null,2));
}catch(error){console.error(JSON.stringify({status:'failed',error:(error as Error).message,jobId:(error as Error&{jobId?:string}).jobId}));process.exitCode=1;}
