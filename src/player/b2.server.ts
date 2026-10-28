import type {Hono} from 'hono';
import {createHash} from 'node:crypto';
import {players,otherPlayers} from '../../public/player/registry.mjs';
import {pilots} from '../../public/ons/registry.mjs';
import {validPath} from '../../public/ons/protocol.mjs';
import {b2ResourceOrigin} from '../../public/player/resource-location.mjs';
import {isolateEntry} from './http.server.ts';
import {isPublicGamePath} from './remote.server.ts';

type ControlBundle={schema:number;entries:Record<string,{source:string;sha1:string;bytes:number}>};
// 只提供本地控制清单和沙箱 HTML。此模块没有外部 fetch，也不打开游戏正文或引擎文件。
export function registerDirectB2Resources(app:Hono,{document,origin,engineReleaseId}:{document:ControlBundle;origin:string;engineReleaseId?:string}){
 if(new URL(origin).origin!==origin||!origin.startsWith('https://')||document?.schema!==1||Object.keys(document.entries??{}).length!==players.length)throw Error('Invalid direct-resource configuration');
 const html=new Map<string,string>(),manifests=new Map<string,{doc:unknown;paths:Set<string>}>();
 for(const player of players){
  const row=document.entries[player.id];if(!row||Buffer.byteLength(row.source)!==row.bytes||createHash('sha1').update(row.source).digest('hex')!==row.sha1)throw Error('Public control source differs');
  if('runtimeKind' in player){html.set(player.id,isolateEntry(row.source,player.id,{resourceOrigin:b2ResourceOrigin,bootstrapOrigin:origin}));continue;}
  const raw=JSON.parse(row.source);if(!Array.isArray(raw.files)||raw.files.length>60000||!Array.isArray(raw.args)||raw.args.length)throw Error('Invalid ONS control manifest');
  const paths=new Set<string>();const files=raw.files.filter((f:{path:string})=>!/(^|\/)\.nomedia$/.test(f.path)).map((f:{path:string;url?:string;lazyload?:boolean})=>{
   if(!validPath(f.path.replaceAll('#','a').replace(/(^|\/)\.([^/.]+\.ogg)$/i,'$1$2'))||paths.has(f.path)||f.url&&f.url!==f.path&&f.url!=='./'+f.path||f.lazyload!==undefined&&typeof f.lazyload!=='boolean')throw Error('Unsafe public control path');
   paths.add(f.path);return {path:f.path,lazyload:f.lazyload??true,url:b2ResourceOrigin+'/__ons/data/'+player.id+'/'+f.path.split('/').map(encodeURIComponent).join('/')};
  });
  manifests.set(player.id,{paths,doc:{pilot:player.id,title:player.title,versionId:player.versionId,engine:player.engine,gamedir:'/game',savedir:'/save',args:[],resourceOrigin:b2ResourceOrigin,files}});
 }
 const headers={'access-control-allow-origin':'*','cross-origin-resource-policy':'cross-origin','x-content-type-options':'nosniff','cache-control':'no-store, no-transform','x-wvn-resource-delivery':'direct-cdn'};
 function page(body:string,policy:string,method:string){return new Response(method==='HEAD'?null:body,{headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':policy}});}
 function policy(id:string){const game=b2ResourceOrigin+'/__player/resource/'+id+'/',engine=b2ResourceOrigin+'/__engines/resource/'+engineReleaseId+'/';return `sandbox allow-scripts; default-src 'none'; script-src ${game} ${engine} ${origin}/player/ ${origin}/ons/ 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:; connect-src ${game} ${engine}; style-src ${game} 'unsafe-inline'; img-src ${game} data: blob:; media-src ${game} data: blob:; font-src ${game} data:; worker-src ${game} blob:; object-src 'none'; base-uri ${game}; form-action 'none'; frame-src 'none'; frame-ancestors 'self'`;}
 function redirect(path:string){return new Response(null,{status:302,headers:{...headers,location:b2ResourceOrigin+path}});}
 for(const prefix of ['/__ons/*','/__player/*'])app.all(prefix,c=>{
  if(!isPublicGamePath(c.req.path))return c.notFound();if(!['GET','HEAD'].includes(c.req.method))return c.body(null,405);
  const ons=/^\/__ons\/(runtime|manifest|data)\/([^/]+)(?:\/(.*))?$/.exec(c.req.path);
  if(ons){const p=pilots.find(p=>p.id===ons[2]);if(!p)return c.notFound();const manifest=manifests.get(p.id)!;
   if(ons[1]==='manifest')return new Response(c.req.method==='HEAD'?null:JSON.stringify(manifest.doc),{headers:{...headers,'content-type':'application/json'}});
   if(ons[1]==='data')return manifest.paths.has(decodeURIComponent(ons[3]??''))?redirect(c.req.path):c.notFound();
   const engine=b2ResourceOrigin+'/__ons/engine/'+p.engine+'/',data=b2ResourceOrigin+'/__ons/data/'+p.id+'/';
   return page('<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WVN ONS 运行区</title><style>html,body{margin:0;width:100%;height:100%;background:#08090b;overflow:hidden}canvas{display:block;margin:auto;max-width:100%;max-height:100%;outline:none}#status{position:absolute;bottom:8px;left:12px;color:#ddd;font:13px sans-serif}</style><canvas id="canvas" tabindex="0"></canvas><p id="status">等待播放器连接…</p><script src="'+origin+'/ons/runtime.js" defer></script></html>',`sandbox allow-scripts; default-src 'none'; script-src ${origin}/ons/ ${origin}/player/ ${engine} 'wasm-unsafe-eval'; connect-src ${origin}/__ons/ ${engine} ${data}; style-src 'unsafe-inline'; img-src ${data} data: blob:; media-src ${data} blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,c.req.method);
  }
  if(c.req.path.startsWith('/__ons/engine/'))return redirect(c.req.path);
  const other=/^\/__player\/(runtime|resource)\/([^/]+)(?:\/(.*))?$/.exec(c.req.path);if(!other||!otherPlayers.some(p=>p.id===other[2]))return c.notFound();
  if(other[1]==='runtime')return c.redirect('/__player/resource/'+other[2]+'/index.html',302);
  if(other[3]==='index.html')return page(html.get(other[2])!,policy(other[2]),c.req.method);
  if(/(^|\/)(service-worker\.js|manage\.html)$/i.test(other[3]??''))return c.notFound();
  return redirect(c.req.path);
 });
 app.all('/__engines/resource/:release/:file',c=>{
  if(!['GET','HEAD'].includes(c.req.method))return c.body(null,405);
  if(c.req.param('release')!==engineReleaseId||!['renpy-pre.js','renpy.js','renpy.wasm','renpy.data'].includes(c.req.param('file')))return c.notFound();
  return redirect(c.req.path);
 });
}
