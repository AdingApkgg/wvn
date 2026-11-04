import fs from 'node:fs/promises';import path from 'node:path';
export const cacheBridgeModules=Object.freeze(['cache/bridge.mjs','cache/client.mjs','cache/worker.mjs','cache/scheduler.mjs','cache/plan.mjs','cache/store.mjs','cache/download.mjs','cache/vendor/noble-hashes/sha2.js','cache/vendor/noble-hashes/_md.js','cache/vendor/noble-hashes/_u64.js','cache/vendor/noble-hashes/utils.js','player/cas-resources.mjs']);
const modules=new Set(cacheBridgeModules);
export function createCacheBridgeHandler({parentOrigin,root=path.resolve('public')}){
 if(new URL(parentOrigin).origin!==parentOrigin||!parentOrigin.startsWith('https://'))throw Error('Invalid parent origin');
 const headers={'cross-origin-embedder-policy':'require-corp','cross-origin-resource-policy':'cross-origin','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':`default-src 'none'; script-src 'self'; worker-src 'self'; connect-src https://wvn-s3-zi0.saop.cc; frame-ancestors ${parentOrigin}; base-uri 'none'; object-src 'none'`};
 return async request=>{
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers});
  const url=new URL(request.url),prefix='/__wvn_cache/';if(!url.pathname.startsWith(prefix)||url.search)return new Response(null,{status:404,headers});const file=url.pathname.slice(prefix.length);
  if(file==='index.html')return new Response(request.method==='HEAD'?null:`<!doctype html><meta charset="utf-8"><meta name="wvn-parent-origin" content="${parentOrigin}"><title>WVN 公共资源缓存</title><script type="module" src="./cache/bridge.mjs"></script>`,{headers:{...headers,'content-type':'text/html; charset=utf-8'}});
  if(!modules.has(file))return new Response(null,{status:404,headers});
  try{return new Response(request.method==='HEAD'?null:await fs.readFile(path.join(root,file)),{headers:{...headers,'content-type':'text/javascript; charset=utf-8'}})}catch{return new Response(null,{status:404,headers})}
 };
}
