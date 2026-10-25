import type{Hono}from'hono';import{readFileSync,realpathSync,lstatSync}from'node:fs';import{resolve,sep,extname}from'node:path';import{sha256,releaseIdentity}from'./registry.ts';
export type ArtifactRelease={id:string;kind:string;mode:string;files:{path:string;sha256:string}[]};
export function registerEngineArtifacts(app:Hono,options:{root:string;releases:ArtifactRelease[]}){
 const base=realpathSync(options.root),releases=new Map<string,ArtifactRelease>(),cache=new Map<string,Buffer>();let cachedBytes=0;
 for(const r of options.releases){
  if(releaseIdentity(r)!==r.id||releases.has(r.id)||!r.files.length||r.files.some(f=>!/^[-\w./]+$/.test(f.path)||f.path.split('/').some(p=>!p||p.startsWith('.'))||!/^[a-f0-9]{64}$/.test(f.sha256)))throw Error('Invalid artifact release manifest');releases.set(r.id,r);
 }
 app.all('/__engines/resource/:release/*',c=>{
  const r=releases.get(c.req.param('release'));if(!r)return c.notFound();
  if(!['GET','HEAD'].includes(c.req.method))return c.body(null,405);
  let path:string;try{path=decodeURIComponent(new URL(c.req.url).pathname.slice(('/__engines/resource/'+r.id+'/').length));}catch{return c.notFound();}
  const file=r.files.find(f=>f.path===path);if(!file)return c.notFound();
  try{
   const key=r.id+'/'+file.path;let bytes=cache.get(key);
   if(!bytes){const target=resolve(base,r.id,file.path);if(lstatSync(target).isSymbolicLink()||!lstatSync(target).isFile()||!realpathSync(target).startsWith(base+sep))throw Error('Invalid artifact file');bytes=readFileSync(target);if(bytes.length>128*1024**2||sha256(bytes)!==file.sha256)throw Error('Artifact hash differs');
    while(cachedBytes+bytes.length>256*1024**2&&cache.size){const first=cache.keys().next().value!;cachedBytes-=cache.get(first)!.length;cache.delete(first);}cache.set(key,bytes);cachedBytes+=bytes.length;
   }
   const headers=new Headers({'Content-Type':({'.wasm':'application/wasm','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8'})[extname(path)]??'application/octet-stream','Content-Length':String(bytes.length),'Cache-Control':'public, max-age=31536000, immutable','ETag':'"'+file.sha256+'"','Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
   if(!c.req.header('range')&&c.req.header('if-none-match')===headers.get('etag'))return new Response(null,{status:304,headers});
   let start=0,end=bytes.length-1,status=200;const range=c.req.header('range');
   if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+bytes.length}});
    if(m[1]){start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}else{const tail=Number(m[2]);start=tail>0?Math.max(0,bytes.length-tail):bytes.length;}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=bytes.length)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+bytes.length}});
    status=206;headers.set('Content-Range',`bytes ${start}-${end}/${bytes.length}`);headers.set('Content-Length',String(end-start+1));
   }
   return new Response(c.req.method==='HEAD'?null:Uint8Array.from(bytes.subarray(start,end+1)),{status,headers});
  }catch{return c.json({error:'引擎制品完整性校验失败'},503);}
 });
}
