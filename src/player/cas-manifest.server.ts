import {Hono} from 'hono';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {players} from '../../public/player/registry.mjs';
import assets from '../../ops/b2/public-assets.mjs';
import type {VersionResources} from '../platform/version-resources.server.ts';
import type {ResourceRepository} from '../resources/repository.ts';
import {ResourceRequestError, SHA256, validMetadata, validNamespace, type Resource} from '../resources/types.ts';

export const RENPY_RELEASE='renpy-5b572ebfa6248cac249cab61f698c967cac82b7d225da7515971b383d0f0a3cf';
const ORIGIN='https://wg-b2.saop.cc', RELEASE='releases/20261027-01/';
const MAX_ROWS=60000, MAX_BYTES=32*1024*1024;
export type ControlBundle={schema:number;entries:Record<string,{source:string;sha1:string;bytes:number}>};
type Options={document:ControlBundle;namespace:string;inventorySha256:string;engineReleaseId:string};
type Entry=Resource & {path:string};
function pathOK(path:string){return typeof path==='string'&&path.length>0&&path.length<=12288&&!path.startsWith('/')&&!/[\\\u0000-\u001f\u007f]/.test(path)&&!path.split('/').some(p=>p==='.'||p==='..'||p==='');}
function checked(row:Resource,path:string):Entry{
 if(!pathOK(path)||!validMetadata(row,row.key)||!/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+(?:\s*;[^\r\n]*)?$/.test(row.contentType)||row.url!==`${ORIGIN}/${row.sha256}.bin`)throw Error('Invalid resource metadata');
 return {path,key:row.key,url:row.url,sha256:row.sha256,bytes:row.bytes,contentType:row.contentType};
}
// 仅组装已发布数据库元数据；不读取游戏、引擎和媒体正文，不缓存发布状态。
export class CasManifestService {
 constructor(private readonly versions:VersionResources,private readonly resources:ResourceRepository,private readonly options:Options){
  if(options.document.schema!==1||!validNamespace(options.namespace)||!SHA256.test(options.inventorySha256)||options.engineReleaseId!==RENPY_RELEASE)throw Error('Invalid CAS manifest configuration');
 }
 private async published(){return !!await this.resources.manifest({namespace:this.options.namespace,version:this.options.inventorySha256,limit:1});}
 private async dependency(originalPath:string,path:string){
  const row=await this.resources.findByOriginalPath(this.options.namespace,originalPath);if(!row)throw Error('Missing registered dependency');return checked(row,path);
 }
 async manifest(id:string,engine?:string){
  const player=players.find(p=>p.id===id);if(!player)return;
  const kind='runtimeKind' in player?player.runtimeKind:'ONS';
  const engineId=kind==='RenPy'?this.options.engineReleaseId:player.engine;
  if(engine!==undefined&&engine!==engineId)throw new ResourceRequestError();
  let cursor:string|undefined, inventory:string|undefined, bytes=0;
  const entries=new Map<string,Entry>(), cursors=new Set<string>();
  do {
   const page=await this.versions.manifest(player.versionId,{limit:500,cursor});if(!page)return;
   if(page.versionId!==player.versionId||!SHA256.test(page.inventorySha256)||inventory&&inventory!==page.inventorySha256)throw Error('Inconsistent inventory');
   inventory=page.inventorySha256;
   if(inventory!==this.options.inventorySha256)throw Error('Unregistered inventory');
   for(const row of page.resources){const item=checked(row,row.path);if(entries.has(item.path)||entries.size>=MAX_ROWS)throw Error('Invalid manifest size or duplicate');bytes+=Buffer.byteLength(JSON.stringify(item));if(bytes>MAX_BYTES)throw Error('Manifest too large');entries.set(item.path,item);}
   cursor=page.nextCursor??undefined;if(cursor){if(cursors.has(cursor))throw Error('Repeated cursor');cursors.add(cursor);}
  }while(cursor);
  if(!await this.published())return;
  const aliases=assets.media as Record<string,string>;
  for(const [alias,file] of Object.entries(aliases)){
   if(!alias.startsWith(id+'\0'))continue;
   const relative=alias.slice(id.length+1);if(!/^[0-9a-f]{64}\.mp4$/.test(file))throw Error('Invalid media registration');
   const matches=[...entries.keys()].filter(path=>path.toLowerCase()===relative);if(matches.length!==1)throw Error('Missing or ambiguous media alias');
   entries.set(matches[0],await this.dependency(RELEASE+'media/'+file,matches[0]));
  }
  const engineFiles:Entry[]=[];
  if(kind==='RenPy')for(const file of ['renpy-pre.js','renpy.js','renpy.wasm','renpy.data'])engineFiles.push(await this.dependency(RELEASE+'engines/'+engineId+'/'+file,file));
  if(kind==='ONS')for(const file of ['onsyuri.js','onsyuri.wasm']){
   const row=await this.dependency(RELEASE+'games/clannad/'+file,file);if(file.endsWith('.wasm')&&row.sha256!==player.engine)throw Error('ONS engine mismatch');engineFiles.push(row);
  }
  const source=this.options.document.entries[id];
  if(!source||source.bytes>MAX_BYTES||Buffer.byteLength(source.source)!==source.bytes||createHash('sha1').update(source.source).digest('hex')!==source.sha1)throw Error('Public control source differs');
  let ons;
  if(kind==='ONS'){
   const raw=JSON.parse(source.source);if(!Array.isArray(raw.files)||raw.files.length>MAX_ROWS||!Array.isArray(raw.args)||raw.args.length)throw Error('Invalid ONS manifest');
   const paths=new Set<string>();const files=raw.files.filter((f:{path:string})=>!/(^|\/)\.nomedia$/.test(f.path)).map((f:{path:string;url?:string;lazyload?:boolean})=>{
    if(!pathOK(f.path)||paths.has(f.path)||f.url&&f.url!==f.path&&f.url!=='./'+f.path||f.lazyload!==undefined&&typeof f.lazyload!=='boolean')throw Error('Unsafe ONS path');
    paths.add(f.path);const resource=entries.get(f.path);if(!resource)throw Error('Missing ONS resource');return {path:f.path,lazyload:f.lazyload??true,url:resource.url};
   });
   ons={pilot:id,title:player.title,versionId:player.versionId,engine:player.engine,gamedir:'/game',savedir:'/save',args:[],resourceOrigin:ORIGIN,files};
  }
  // 页面遍历期间撤销发布也必须失败；复查只读状态，不缓存旧清单。
  const final=await this.versions.manifest(player.versionId,{limit:1});
  if(!final||!await this.published())return;
  if(final.inventorySha256!==inventory)throw Error('Inventory changed');
  const result={schema:1,delivery:'cas',pilot:id,versionId:player.versionId,inventorySha256:inventory,resourceOrigin:ORIGIN,resources:[...entries.values()],engineResources:{id:engineId,files:engineFiles},...(ons?{ons}:{})};
  const body=JSON.stringify(result);if(Buffer.byteLength(body)>MAX_BYTES)throw Error('Manifest too large');return body;
 }
}
function acceptsGzip(value:string){
 const values=new Map(value.toLowerCase().split(',').map(part=>{const [name,...params]=part.trim().split(/\s*;\s*/);const q=params.find(p=>p.startsWith('q='))?.slice(2)??'1';return [name,/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(q)?Number(q):0] as const;}));
 return (values.get('gzip')??values.get('*')??0)>0;
}
export function createCasManifestApp(service:CasManifestService){
 const app=new Hono();
 app.onError((error,c)=>c.json({error:error instanceof ResourceRequestError?'invalid_request':'resource_unavailable'},error instanceof ResourceRequestError?400:503));
 app.all('/api/player/:id/resources',async c=>{
  c.header('Cache-Control','no-store, no-transform');
  if(!['GET','HEAD'].includes(c.req.method))return c.body(null,405,{Allow:'GET, HEAD'});
  const query=new URL(c.req.url).searchParams;
  if([...query.keys()].some(key=>key!=='engine'||query.getAll(key).length!==1)||query.has('engine')&&!/^[A-Za-z0-9_-]{1,128}$/.test(query.get('engine')!))throw new ResourceRequestError();
  const body=await service.manifest(c.req.param('id'),query.get('engine')??undefined);if(body===undefined)return c.json({error:'not_found'},404);
  const compressed=acceptsGzip(c.req.header('Accept-Encoding')??'');const data=compressed?new Uint8Array(gzipSync(body)):body;
  return new Response(c.req.method==='HEAD'?null:data,{headers:{'cache-control':'no-store, no-transform','content-type':'application/json; charset=utf-8','content-length':String(typeof data==='string'?Buffer.byteLength(data):data.byteLength),'vary':'Accept-Encoding','x-content-type-options':'nosniff',...(compressed?{'content-encoding':'gzip'}:{})}});
 });return app;
}
