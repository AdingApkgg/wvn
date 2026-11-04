import type {Hono} from 'hono';
import {players} from '../../public/player/registry.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';

const execute=promisify(execFile);
// 仅用于隔离预览元数据。显式沿用机器代理，压缩传输，并在监听器短超时前结束。
const previewFetch:typeof fetch=async(input,init)=>{
 const proxy=process.env.HTTPS_PROXY??process.env.https_proxy;
 if(!proxy||!['http:','https:'].includes(new URL(proxy).protocol))throw Error('Preview metadata proxy required');
 const {stdout}=await execute('curl',['--proxy',proxy,'--noproxy','','--silent','--show-error','--fail','--compressed','--max-time','12','--proto','=https',String(input)],{encoding:'utf8',maxBuffer:32*1024*1024,timeout:14_000,signal:init?.signal??undefined});
 return new Response(stdout,{headers:{'content-type':'application/json'}});
};

/** 隔离预览读取已公开的CAS元数据；不代理游戏、媒体或引擎正文。 */
export function registerPreviewManifests(app:Hono,options:{origin:string;deployment:string;fetcher?:typeof fetch;manifestDirectory?:string}){
 if(options.deployment!=='preview'||options.origin!=='https://wg.saop.cc')throw Error('Public manifest bridge is preview-only');
 const fetcher=options.fetcher??previewFetch;
 app.all('/api/player/:id/resources',async c=>{
  if(!['GET','HEAD'].includes(c.req.method))return c.body(null,405);
  const player=players.find(p=>p.id===c.req.param('id'));if(!player)return c.notFound();
  const query=new URL(c.req.url).searchParams;
  if([...query.keys()].some(key=>key!=='engine'||query.getAll(key).length!==1)||query.has('engine')&&!/^[A-Za-z0-9_-]{1,128}$/.test(query.get('engine')!))return c.json({code:'INVALID_QUERY'},400);
  try{
   const target=new URL('/api/player/'+encodeURIComponent(player.id)+'/resources',options.origin);target.search=query.toString();
   let response:Response;
   if(options.manifestDirectory){
    // 文件名仅由已登记播放器和严格校验的引擎标识组成；仍经过下方同一套清单校验。
    const file=join(options.manifestDirectory,player.id+(query.has('engine')?'--'+query.get('engine'):'')+'.json');
    if((await stat(file)).size>32*1024*1024)throw Error('Manifest exceeds limit');
    response=new Response(await readFile(file,'utf8'),{headers:{'content-type':'application/json'}});
   }else response=await fetcher(target.href,{credentials:'omit',redirect:'error',headers:{accept:'application/json','accept-encoding':'identity'},signal:AbortSignal.any([c.req.raw.signal,AbortSignal.timeout(45_000)])});
   if(!response.ok)return c.json({code:'PREVIEW_MANIFEST_UNAVAILABLE'},503);
   const reader=response.body?.getReader();if(!reader)throw Error('Empty manifest');
   const chunks:Uint8Array[]=[];let bytes=0;
   try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>32*1024*1024)throw Error('Manifest exceeds limit');chunks.push(part.value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
   const text=Buffer.concat(chunks).toString('utf8'),value=JSON.parse(text);
   if(value.schema!==1||value.delivery!=='cas'||value.versionId!==player.versionId||!Array.isArray(value.resources)||value.resources.length>60_000)throw Error('Invalid manifest');
   // 与线上客户端使用同一固定CAS入口；严格校验后返回原清单，不改写任何地址。
   const canonical='https://wvn-s3-zi0.saop.cc';
   if(value.resourceOrigin!==canonical)throw Error('Invalid CAS origin');
   for(const row of [...value.resources,...(value.engineResources?.files??[])]){
    if(!/^[a-f0-9]{64}$/.test(row.sha256)||row.url!==canonical+'/'+row.sha256+'.bin')throw Error('Invalid CAS URL');
   }
   if(value.ons){
    if(value.ons.resourceOrigin!==canonical||!Array.isArray(value.ons.files))throw Error('Invalid ONS origin');
    const resources=new Map(value.resources.map((row:any)=>[row.path,row]));
    for(const file of value.ons.files){const row=resources.get(file.path) as any;if(!row||file.url!==row.url)throw Error('Invalid ONS resource')}
   }
   return new Response(c.req.method==='HEAD'?null:text,{headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','vary':'Cookie'}});
  }catch{return c.json({code:'PREVIEW_MANIFEST_UNAVAILABLE'},503)}
 });
}
