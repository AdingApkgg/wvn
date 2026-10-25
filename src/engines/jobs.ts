import {mkdirSync,writeFileSync,readFileSync,renameSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {randomUUID} from 'node:crypto';
export const phases=['created','fetching','building','artifact_verified','testing','preview_ready','failed'] as const;
export type Phase=typeof phases[number];
export type Job={id:string;root:string;recipe:string;state:Phase;history:{state:Phase;at:string}[];details:Record<string,unknown>};
function save(job:Job){const temp=join(job.root,'job.next');writeFileSync(temp,JSON.stringify(job,null,2),{mode:0o600});renameSync(temp,join(job.root,'job.json'));}
export function createJob(state:string,recipe:string):Job{
 const id=randomUUID(),root=join(state,'jobs',id);mkdirSync(root,{recursive:true,mode:0o700});
 const job:Job={id,root,recipe,state:'created',history:[{state:'created',at:new Date().toISOString()}],details:{}};save(job);return job;
}
export function updateJob(job:Job,state:Phase,details:Record<string,unknown>={}){
 if(['failed','preview_ready'].includes(job.state))throw Error('Job is terminal');
 if(state!=='failed'&&phases.indexOf(state)!==phases.indexOf(job.state)+1)throw Error('Invalid job transition');
 job.state=state;job.details={...job.details,...details};job.history.push({state,at:new Date().toISOString()});save(job);
}
export function readJob(root:string):Job{return JSON.parse(readFileSync(join(root,'job.json'),'utf8'));}
export async function withBuildLock<T>(state:string,action:()=>Promise<T>):Promise<T>{
 mkdirSync(state,{recursive:true,mode:0o700});const lock=join(state,'build.lock');
 try{mkdirSync(lock,{mode:0o700});}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw Error('Build is locked; inspect the existing job before retrying');throw e;}
 try{writeFileSync(join(lock,'owner.json'),JSON.stringify({pid:process.pid,at:new Date().toISOString()}),{mode:0o600});return await action();}
 finally{rmSync(lock,{recursive:true});}
}
