import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {analyticsPayload} from './contract.ts';
export type AnalyticsConfig={websiteId:string;internalUrl:string};
type Options=AnalyticsConfig&{origin:string;timeoutMs?:number;fetch?:(input:string,init:RequestInit)=>Promise<Response>};
export function createAnalyticsApp(options:Options){
 const internal=new URL(options.internalUrl),origin=new URL(options.origin);
 if(internal.origin!==options.internalUrl||internal.protocol!=='http:'||internal.hostname!=='127.0.0.1'||internal.username||internal.password||!internal.port||!/^[-a-f0-9]{36}$/i.test(options.websiteId)||origin.origin!==options.origin||origin.protocol!=='https:')throw Error('Invalid private analytics configuration');
 const app=new Hono(),send=options.fetch??((url,init)=>fetch(url,init));
 const failed=()=>Response.json({code:'ANALYTICS_UNAVAILABLE'},{status:502,headers:{'cache-control':'no-store'}});
 async function forward(path:string,init:RequestInit){
  try{
   const response=await send(internal.origin+path,{...init,redirect:'error',signal:AbortSignal.timeout(options.timeoutMs??3000)});
   if(!response.ok||Number(response.headers.get('content-length')??0)>1024**2)return failed();
   const body=await response.arrayBuffer();if(body.byteLength>1024**2)return failed();
   return new Response(body,{status:response.status,headers:{'content-type':response.headers.get('content-type')??(path==='/script.js'?'text/javascript':'application/json'),'cache-control':path==='/script.js'?'public, max-age=3600':'no-store'}});
  }catch{return failed()}
 }
 app.get('/script.js',()=>forward('/script.js',{method:'GET'}));
 app.post('/api/send',bodyLimit({maxSize:65536,onError:c=>c.json({code:'ANALYTICS_TOO_LARGE'},413)}),async c=>{
  if(c.req.header('origin')!==options.origin||['same-site','cross-site'].includes(c.req.header('sec-fetch-site')??''))return c.json({code:'ORIGIN_INVALID'},403);
  if(!/^application\/json(?:\s*;|$)/i.test(c.req.header('content-type')??''))return c.json({code:'ANALYTICS_INVALID'},400);
  let raw;try{raw=await c.req.json()}catch{return c.json({code:'ANALYTICS_INVALID'},400)}
  const payload=analyticsPayload(raw,options.websiteId,origin.hostname);if(!payload)return c.json({code:'ANALYTICS_INVALID'},400);
  const headers=new Headers({'content-type':'application/json'});
  const agent=c.req.header('user-agent'),cache=c.req.header('x-umami-cache');
  if(agent)headers.set('user-agent',agent.slice(0,512));if(cache&&cache.length<=4096)headers.set('x-umami-cache',cache);
  return forward('/api/send',{method:'POST',headers,body:JSON.stringify(payload)});
 });
 app.all('*',c=>c.json({code:'NOT_FOUND'},404));return app;
}
