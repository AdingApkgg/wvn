export const b2ResourceOrigin='https://wg-b2.saop.cc';
export const b2ReleasePrefix='/releases/20261027-01/';
export function resourceOriginForManifest(value,origin){
 if(value===undefined)return origin;
 if(value!==b2ResourceOrigin)throw Error('Untrusted resource origin');
 return value;
}
export function runtimeResourceOrigin(base,entry,origin){
 const suffix='/__player/resource/'+entry.id+'/';
 if(base===origin+suffix)return origin;
 if(base===b2ResourceOrigin+suffix)return b2ResourceOrigin;
 throw Error('Untrusted game resource base');
}
export async function verifyDirectEngine(entry,release,assetOrigin,{fetcher=fetch,resolver}={}){
 if(assetOrigin!==b2ResourceOrigin)return;
 const verified=new Map(),rows=[...(release?.files??Object.entries(entry.engineFiles).map(([path,sha256])=>({path,sha256})))];
 // 已登记的游戏启动包先走可恢复读取，再由原生 getPreloadedPackage 接收。
 if(!release)rows.push(...Object.entries(entry.packageFiles??{}).map(([path,sha256])=>({path,sha256})));
 const base=assetOrigin+(release?'/__engines/resource/'+release.id+'/':'/__player/resource/'+entry.id+'/');
 if(!Array.isArray(rows)||rows.length>30||rows.some(f=>typeof f.path!=='string'||f.path.split('/').some(p=>!p||p==='.'||p==='..')||/[\\%?#:]/.test(f.path)||!/^[a-f0-9]{64}$/.test(f.sha256)))throw Error('Unregistered engine fingerprint');
 // 逐个核验，避免移动浏览器同时持有数个大引擎文件；随后由浏览器 HTTP 缓存复用。
 for(const file of rows){
  const r=await fetcher(resolver?resolver.url(file.path):base+file.path,{credentials:'omit',redirect:'error',cache:'force-cache'});
  if(r.status!==200)throw Error('Direct engine download failed');
  const limit=128*1024**2,chunks=[];let length=0;
  if(Number(r.headers.get('content-length'))>limit){await r.body?.cancel();throw Error('Engine exceeds size limit');}
  const reader=r.body?.getReader();try{if(reader)for(;;){const p=await reader.read();if(p.done)break;length+=p.value.length;if(length>limit){await reader.cancel();throw Error('Engine exceeds size limit');}chunks.push(p.value);}}finally{reader?.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(hash!==file.sha256)throw Error('Direct engine checksum differs');
  verified.set(file.path,bytes);
 }
 return verified;
}
export {createCasResolver,readCasManifest,rewriteCasCss,rewriteCasCssUrls} from './cas-resources.mjs';
