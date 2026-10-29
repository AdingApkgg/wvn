import type {Hono} from 'hono';
import {readFileSync} from 'node:fs';
import{registerPlayerModules}from'./modules.server.ts';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {otherPlayers} from '../../public/player/registry.mjs';
import {fileResponse} from '../server/resources.ts';
import {createMediaProjection,mediaManifest}from './media.server.ts';

export function isPlayerResourcePath(path:string){
  const match=/^\/__player\/resource\/([^/]+)\//.exec(path);
  return !!match&&otherPlayers.some(player=>player.id===match[1]);
}
export function isolateEntry(html:string,id:string,options?:{resourceOrigin:string;bootstrapOrigin:string;cas?:boolean}){
  // Original executable scripts stay inert until the parent supplies its dedicated
  // storage channel. The original game DOM/CSS remains inside the opaque frame.
  let safe=html.replace(/<base\b[^>]*>/gi,'').replace(/<meta\b[^>]*http-equiv[^>]*>/gi,'');
  safe=safe.replace(/<link\b([^>]*)>/gi,(_,attrs)=>`<link crossorigin="anonymous"${attrs.replace(/\s+crossorigin(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi,'')}>`);
  safe=safe.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,(_,attrs,body)=>{
    const src=/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    // All scripts in the audited entries are classic JavaScript.
    const config=JSON.stringify({src:src?.[1]??src?.[2]??src?.[3]??null,body:src?'':body}).replace(/</g,'\\u003c');
    return `<script type="application/x-wg-script">${config}</script>`;
  });
  if(options&&(options.resourceOrigin!=="https://wg-b2.saop.cc"||new URL(options.bootstrapOrigin).origin!==options.bootstrapOrigin||!options.bootstrapOrigin.startsWith("https://")))throw Error("Untrusted bootstrap origin");
  const bootstrap=`<base href="${options?.resourceOrigin??""}/__player/resource/${id}/"><script type="module" src="${options?.bootstrapOrigin??""}/player/runtime.mjs"></script>`;
  if(options?.cas){safe=safe.replace(/<body\b([^>]*)>/i,'<div data-cas-body$1>').replace(/<\/body\s*>/i,'</div>');return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+bootstrap+'</head><body><template id="wg-cas-document">'+safe+'</template></body></html>';}
  return safe.replace(/<head\b[^>]*>/i,match=>match+bootstrap);
}
export function registerOtherPlayers(app:Hono,root:string,options?:{mediaRoot?:string;mediaManifest?:unknown}){
  const media=createMediaProjection(root,options?.mediaRoot??process.env.WG_PLAYER_MEDIA_ROOT,options?.mediaManifest??mediaManifest());
  registerPlayerModules(app);
  const checked=new Set<string>();
  function verify(player:typeof otherPlayers[number]){
    if(checked.has(player.id))return;
    for(const [file,hash]of Object.entries(player.engineFiles))if(createHash('sha256').update(readFileSync(resolve(root,player.directory,file))).digest('hex')!==hash)throw Error('Engine fingerprint differs');
    checked.add(player.id);
  }
  function headers(c:any,id:string){
    const origin=new URL(c.req.url).origin,base=`${origin}/__player/resource/${id}/`;
    c.header('Content-Security-Policy',`sandbox allow-scripts; default-src 'none'; script-src ${base} ${origin}/player/ ${origin}/ons/ 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:; connect-src ${base}; style-src ${base} 'unsafe-inline'; img-src ${base} data: blob:; media-src ${base} data: blob:; font-src ${base} data:; worker-src ${base} blob:; object-src 'none'; base-uri ${base}; form-action 'none'; frame-src 'none'; frame-ancestors 'self'`);
    c.header('Access-Control-Allow-Origin','*');c.header('Cross-Origin-Resource-Policy','cross-origin');c.header('X-Content-Type-Options','nosniff');c.header('Referrer-Policy','no-referrer');
  }
  app.get('/__player/runtime/:id',c=>{
    const player=otherPlayers.find(p=>p.id===c.req.param('id'));if(!player)return c.notFound();
    headers(c,player.id);c.header('Cache-Control','no-store');
    try{verify(player);return c.redirect(`/__player/resource/${player.id}/index.html`,302)}catch{return c.json({error:'游戏入口不可用'},503)}
  });
  app.on(['GET','HEAD'],'/__player/resource/:id/*',async c=>{
    const player=otherPlayers.find(p=>p.id===c.req.param('id'));if(!player)return c.notFound();
    const prefix=`/__player/resource/${player.id}/`,encoded=new URL(c.req.url).pathname.slice(prefix.length);
    headers(c,player.id);
    try{
      const path=decodeURIComponent(encoded);
      if(/(?:^|\/)(?:service-worker\.js|manage\.html)$/i.test(path))return c.notFound();
      if(path==='index.html'){
        verify(player);c.header('Cache-Control','no-store');
        return c.html(isolateEntry(readFileSync(resolve(root,player.directory,'index.html'),'utf8'),player.id));
      }
      const response=await media(c.req.raw,player.id,path)??await fileResponse(c.req.raw,resolve(root,player.directory),'/'+encoded);
      headers({req:c.req,header:(key:string,value:string)=>response.headers.set(key,value)},player.id);
      return response;
    }catch{return c.notFound()}
  });
}
