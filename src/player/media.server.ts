import {readFileSync,createReadStream} from 'node:fs';
import {realpath,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash}from'node:crypto';
import {insideRoot,fileResponse}from'../server/resources.ts';
import {otherPlayers}from'../../public/player/registry.mjs';
import {validPath}from'../../public/ons/protocol.mjs';
type Override={id:string;path:string;file:string;sourceSHA256:string;sourceBytes:number;sha256:string;bytes:number};
export function createMediaProjection(gameRoot:string,mediaRoot:string|undefined,document:unknown){
 const doc=document as {schema?:number;entries?:Override[]};
 if(doc?.schema!==1||!Array.isArray(doc.entries)||doc.entries.length>1000)throw Error('Invalid media manifest');
 const rows=new Map<string,Override>(),checked=new Map<string,Promise<void>>();
 for(const row of doc.entries){
  const key=row.id+'\0'+row.path.toLowerCase();
  if(!otherPlayers.some(p=>p.id===row.id)||!validPath(row.path)||!/\.(mp4|ogv|webm|m4v)$/i.test(row.path)||!/^([a-f0-9]{64})\.mp4$/.test(row.file)||![row.sha256,row.sourceSHA256].every(hash=>/^[a-f0-9]{64}$/.test(hash))||![row.bytes,row.sourceBytes].every(n=>Number.isSafeInteger(n)&&n>0)||rows.has(key))throw Error('Invalid media override');
  rows.set(key,row);
 }
 if(rows.size&&!mediaRoot)throw Error('Media adaptation directory required');
 async function verify(base:string,file:string,bytes:number,hash:string){
  const root=await realpath(base),target=await realpath(resolve(root,file));
  if(!insideRoot(root,target)||(await stat(target)).size!==bytes)throw Error('Media artifact differs');
  const digest=createHash('sha256');for await(const chunk of createReadStream(target))digest.update(chunk);
  if(digest.digest('hex')!==hash)throw Error('Media digest differs');
 }
 return async(request:Request,id:string,path:string)=>{
  const key=id+'\0'+path.toLowerCase(),row=rows.get(key);if(!row)return null;
  const player=otherPlayers.find(p=>p.id===id)!;
  let check=checked.get(key);
  if(!check){check=Promise.all([verify(resolve(gameRoot,player.directory),row.path,row.sourceBytes,row.sourceSHA256),verify(mediaRoot!,row.file,row.bytes,row.sha256)]).then(()=>{});checked.set(key,check)}
  try{await check;return await fileResponse(request,mediaRoot!,'/'+row.file)}catch{return new Response(null,{status:503})}
 };
}
export function mediaManifest(){return JSON.parse(readFileSync(resolve('data/player-media-overrides.json'),'utf8'))}
