import{readFileSync,readdirSync}from'node:fs';import{join}from'node:path';import{phases,type Job}from'./jobs.ts';import{engineSummary}from'./registry.ts';
export function jobSummary(job:Job){
 if(!/^[a-f0-9-]{36}$/.test(job.id)||!phases.includes(job.state))throw Error('Invalid job status');
 const at=job.history.at(-1)?.at,sdk=job.details.sdk as any;
 const safeSdk=sdk&&/^emsdk-\d+\.\d+\.\d+-linux-x64$/.test(sdk.id)&&/^\d+\.\d+\.\d+$/.test(sdk.version)&&sdk.status==='verified'?{id:sdk.id,version:sdk.version,status:'verified'}:null;
 return {id:job.id,recipe:job.recipe==='onsyuri'?'onsyuri':'unknown',state:job.state,at:typeof at==='string'&&/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(at)?at:undefined,sdk:safeSdk,releaseId:typeof job.details.releaseId==='string'&&/^ons-[a-f0-9]{64}$/.test(job.details.releaseId)?job.details.releaseId:null,compatibility:job.details.compatibility==='unknown'?'unknown':null,errorCode:job.state==='failed'?'BUILD_FAILED':null};
}
export function buildStatus(state:string){
 let jobs:ReturnType<typeof jobSummary>[]=[];
 try{jobs=readdirSync(join(state,'jobs')).filter(id=>/^[a-f0-9-]{36}$/.test(id)).map(id=>{try{return jobSummary(JSON.parse(readFileSync(join(state,'jobs',id,'job.json'),'utf8')))}catch{return null}}).filter(x=>x!==null).sort((a,b)=>(b.at??'').localeCompare(a.at??'')).slice(0,20);}catch{}
 return {schema:1,at:new Date().toISOString(),jobs};
}
export function managementSummary(root=process.cwd(),statusFile=process.env.WG_ENGINE_STATUS_FILE){
 const summary=engineSummary(root);let status:ReturnType<typeof buildStatus>={schema:1,at:'',jobs:[]};
 if(statusFile){try{const raw=JSON.parse(readFileSync(statusFile,'utf8'));status={schema:1,at:String(raw.at??''),jobs:(Array.isArray(raw.jobs)?raw.jobs:[]).slice(0,20).map((j:any)=>jobSummary({id:j.id,recipe:j.recipe,state:j.state,history:[{state:j.state,at:String(j.at??'')}],root:'',details:{sdk:j.sdk,releaseId:j.releaseId,compatibility:j.compatibility}}))};}catch{}}
 return {...summary,status};
}
