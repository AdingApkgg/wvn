import type {Store} from '../server/store.ts';
import type {ContentAccess} from './types.ts';
import {PUBLIC_CONTENT_ACCESS,accessError,projectWork,restrictedAllowed,versionAccessError,workVisible} from './policy.ts';
import {getContentAccess,cacheContentAccess,cachedContentAccess} from './access.server.ts';
import {players} from '../../public/player/registry.mjs';
import {parseWorkSlug,workIdPattern} from '../identity.ts';

export type ShareReview={suitability:'sfw'|'nsfw'|'unknown';versionId?:string;title?:string;description?:string;progress?:string;spoiler?:boolean};
type Options={enabled:boolean;access?:(request:Request)=>Promise<ContentAccess>;shareReview?:(id:string)=>Promise<ShareReview>;ownWorkIds?:(request:Request)=>Promise<Set<string>>};
type Fetcher=(request:Request)=>Response|Promise<Response>;
function failure(code:string,status=403){return Response.json({code},{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}})}
// 内容资格响应保持私有；保留运行页声明的no-transform，避免边缘注入破坏opaque沙箱。
function privateCacheControl(headers:Headers){return headers.get('Cache-Control')?.split(',').some(value=>value.trim().toLowerCase()==='no-transform')?'private, no-store, no-transform':'private, no-store'}
function replace(response:Response,value:unknown){
 const headers=new Headers(response.headers);for(const name of ['Content-Length','Content-Encoding','ETag'])headers.delete(name);
 headers.set('Cache-Control',privateCacheControl(headers));headers.set('Vary','Cookie');return Response.json(value,{status:response.status,headers});
}
async function transferBody(request:Request){
 const limit=64*1024;
 if(Number(request.headers.get('content-length'))>limit)throw new Error('BODY_TOO_LARGE');
 const reader=request.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
 if(reader)for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>limit){void reader.cancel();throw new Error('BODY_TOO_LARGE')}chunks.push(item.value)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 return bytes;
}
/** 最外层包裹实际listener和同进程公开投影，覆盖在框架前注册的API。 */
export function createContentFetch(next:Fetcher,store:Store,options:Options):Fetcher{
 return async request=>{
  if(!options.enabled)return next(request);
  const url=new URL(request.url);let path:string;
  try{path=decodeURIComponent(url.pathname)}catch{return failure('INVALID_PATH',400)}
  // 原通用资源索引不再公开，内部发布和清单服务直接使用仓储。
  if(/^\/api\/resources(?:\/|$)/.test(path))return failure('NOT_FOUND',404);
  if(path.startsWith('/media/')){
   const media=await store.classifications.get('image',path);
   if(media?.sexual!=='safe'||media.violence!=='tame')return failure('CONTENT_MEDIA_UNREVIEWED',403);
  }
  // 私人存档的所有权校验保留原实现，不以浏览资格阻止备份操作。
  const bypass=/^\/api\/(?:auth(?:\/|$)|me\/(?:content(?:\/|$)|export$|save-profiles(?:\/|$)|uploads(?:\/|$)|passkeys(?:\/|$)|devices(?:\/|$)|recovery(?:\/|$)))|^\/api\/recovery(?:\/|$)/.test(path);
  if(bypass)return next(request);
  if(path.startsWith('/assets/')||path==='/health'||path==='/favicon.ico'||request.method==='GET'&&/^\/api\/me\/share-claims\//.test(path))return next(request);
  const version=/^\/api\/versions\/([^/]+)\/(?:resources|resource)$/.exec(path);
  const player=/^\/api\/player\/([^/]+)\/resources$/.exec(path)??/^\/__(?:ons|player)\/(?:runtime|manifest|data|resource)\/([^/]+)(?:\/|$)/.exec(path);
  const playerVersion=player?players.find(p=>p.id===player[1])?.versionId:undefined;
  const accessPromise=cachedContentAccess(request)??(options.access??getContentAccess)(request);
  cacheContentAccess(request,accessPromise);
  let access:ContentAccess;
  try{access=await accessPromise}catch{
   if(version||player||path.startsWith('/api/works/')||request.method==='POST'&&/^\/api\/me\/(?:share-claims|share-downloads)$/.test(path))return failure('CONTENT_UNAVAILABLE',503);
   access={...PUBLIC_CONTENT_ACCESS};cacheContentAccess(request,Promise.resolve(access));
  }
  if(version||player){
   const id=version?.[1]??playerVersion;
   if(!id)return failure('NOT_FOUND',404);
   const row=await store.raw(id),work=row?await store.get(row.workId):undefined;
   const item=work?.versions.find(v=>v.id===id);
   if(!work||!item)return failure('NOT_FOUND',404);
   const error=versionAccessError(work,item,access);if(error)return failure(error,error==='SIGN_IN_REQUIRED'?401:403);
  }
  const workRoute=/^\/api\/works\/([^/]+)$/.exec(path);
  const workId=workRoute?(workIdPattern.test(workRoute[1])?workRoute[1]:parseWorkSlug(workRoute[1])):undefined;
  if(workId){const work=await store.get(workId);if(work&&!workVisible(work,access))return failure(accessError(access),access.authenticated?403:401)}
  // 分享文本具有独立审核状态；无明确SFW证据时只有主动开启者可读取。
  const shareRead=/^\/api\/(?:public\/(?:save-shares\/|works\/[^/]+\/save-shares)|share-links\/[^/]+\/inspect)/.test(path);
  const shareTransfer=request.method==='POST'&&/^\/api\/me\/(?:share-claims$|share-downloads$)/.test(path);
  if(shareTransfer){
   let bytes:Uint8Array<ArrayBuffer>;try{bytes=await transferBody(request)}catch(error){return failure(error instanceof Error&&error.message==='BODY_TOO_LARGE'?'BODY_TOO_LARGE':'INVALID_BODY',error instanceof Error&&error.message==='BODY_TOO_LARGE'?413:400)}
   let id:string|undefined;try{id=JSON.parse(new TextDecoder().decode(bytes)).shareId}catch{return failure('INVALID_BODY',400)}
   request=new Request(request,{body:bytes});
   const review=id&&options.shareReview?await options.shareReview(id):null;
   const row=review?.versionId?await store.raw(review.versionId):undefined,work=row?await store.get(row.workId):undefined;
   const item=work?.versions.find(v=>v.id===row?.id);
   if(!work||!item||versionAccessError(work,item,access)||(!restrictedAllowed(access)&&review?.suitability!=='sfw'))return failure(accessError(access),access.authenticated?403:401);
  }
  const response=await next(request);
  const headers=new Headers(response.headers);headers.set('Cache-Control',privateCacheControl(headers));
  const vary=headers.get('Vary');if(!vary?.split(',').some(v=>v.trim().toLowerCase()==='cookie'))headers.set('Vary',[vary,'Cookie'].filter(Boolean).join(', '));
  const result=new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  if(request.method==='HEAD'||!response.ok||!response.headers.get('Content-Type')?.includes('application/json'))return result;
  const projects=['/api/catalog','/api/account-catalog','/api/me/library','/api/me/save-shares','/api/public/work-stats'];
  const libraryRoute=/^\/api\/me\/library(?:\/[^/]+)?$/.test(path);
  if(!projects.includes(path)&&!workRoute&&!shareRead&&!libraryRoute)return result;
  const value=await result.clone().json();
  const all=await store.list();const byId=new Map(all.map(w=>[w.id,w]));
  if(shareRead){
   const safeShare=async(share:any)=>{
    const raw=byId.get(share.work?.id),work=raw?projectWork(raw,access):null,version=work?.versions.find(v=>v.id===share.version?.id);
    if(!work||!version)return null;
    if(restrictedAllowed(access))return share;
    const review=options.shareReview?await options.shareReview(share.id):null;
    if(review?.suitability!=='sfw'||['title','description','progress','spoiler'].some(key=>share[key]!==review[key as keyof ShareReview]))return null;
    return {...share,work:{...share.work,title:work.title,url:work.url},version:{...share.version,title:version.title},files:[],publicSource:share.publicSource?{...share.publicSource,title:'来源分享'}:null,contentRedacted:true};
   };
   if(Array.isArray(value.items)){const items=(await Promise.all(value.items.map(safeShare))).filter(Boolean);return replace(result,{...value,items})}
   const share=await safeShare(value);return share?replace(result,share):failure(accessError(access),access.authenticated?403:401);
  }
  if(path==='/api/catalog')return replace(result,all.flatMap(w=>{const p=projectWork(w,access);return p?.versions.length?[p]:[]}));
  if(workId){const work=byId.get(workId);return work?replace(result,projectWork(work,access)):result}
  if(path==='/api/account-catalog'&&Array.isArray(value)){
   const owned=access.authenticated&&options.ownWorkIds?await options.ownWorkIds(request):new Set<string>();
   return replace(result,value.flatMap(w=>{
   const raw=byId.get(w.id);const safe=raw?projectWork(raw,access):null;
   return safe?[{id:safe.id,title:safe.title,url:safe.url,versions:safe.versions.map(v=>({id:v.id,title:v.title,number:v.number,engine:v.engine,url:v.url}))}]:owned.has(w.id)?[{id:w.id,title:'受限作品',url:w.url,versions:w.versions.map((v:any)=>({id:v.id,number:v.number,engine:v.engine,url:v.url,title:`版本 ${v.number} · 受限`}))}]:[];
   }));
  }
  if(libraryRoute&&!restrictedAllowed(access))return replace(result,Array.isArray(value)?value.map(row=>({...row,note:'',noteHidden:true})):{...value,note:'',noteHidden:true});
  if(path==='/api/public/work-stats')return replace(result,Object.fromEntries(Object.entries(value).filter(([id])=>{const work=byId.get(id);return work&&workVisible(work,access)})));
  if(path==='/api/me/save-shares'&&!restrictedAllowed(access)){
   const redact=(s:any)=>({...s,title:'受限存档分享',description:'',pending:null,work:{...s.work,title:'受限作品'},version:{...s.version,title:`版本 ${s.version?.number??''} · 受限`},publicSource:s.publicSource?{...s.publicSource,title:'受限来源'}:null});
   return replace(result,{...value,items:Array.isArray(value.items)?value.items.map(redact):[]});
  }
  return result;
 };
}
