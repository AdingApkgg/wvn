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
// B2 原生下载可能没有 ETag。只对 PG 清单已钉住摘要和大小的引擎/启动包
// 分段重读；整包摘要通过之前不把任何字节交给引擎，不要求服务器添加校验头。
export async function readPinnedResource(row,{fetcher=fetch,chunkBytes=4*1024**2,retries=3,idleMs=30000,retryDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 if(!row||!/^[a-f0-9]{64}$/.test(row.sha256)||row.url!==b2ResourceOrigin+'/'+row.sha256+'.bin'||!Number.isSafeInteger(row.bytes)||row.bytes<0||row.bytes>128*1024**2||!Number.isSafeInteger(chunkBytes)||chunkBytes<1)throw Error('Untrusted pinned resource');
 const output=new Uint8Array(row.bytes),deadline=Date.now()+1800000;
 async function part(start,end){
  let attempt=0;
  for(;;){
   if(Date.now()>deadline)throw Error('Pinned resource total timeout');
   const controller=new AbortController();let timer;const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(new DOMException('Pinned resource idle timeout','TimeoutError')),idleMs)};
   try{
    touch();const headers=new Headers();if(row.bytes>chunkBytes)headers.set('range',`bytes=${start}-${end}`);
    const r=await fetcher(row.url,{headers,credentials:'omit',redirect:'error',cache:headers.has('range')?'no-store':'force-cache',signal:controller.signal});
    if(r.status!==200&&r.status!==206)throw Error('Pinned resource download failed '+r.status);
    const encoded=r.headers.get('content-encoding');if(r.status===206&&encoded)throw Error('Pinned resource encoding differs');
    const full=r.status===200,expected=full?row.bytes:end-start+1;
    if(!full&&r.headers.get('content-range')!==`bytes ${start}-${end}/${row.bytes}`)throw Error('Pinned resource range differs');
    // 整包 JS 可由 CDN 压缩，而 CORS 不一定暴露 Content-Encoding；读取后
    // 仍逐字节核对清单大小和摘要。206 必须保持精确的线上长度与范围。
    if(!full&&r.headers.has('content-length')&&Number(r.headers.get('content-length'))!==expected)throw Error('Pinned resource length differs');
    const data=new Uint8Array(expected),reader=r.body?.getReader();let size=0;
    try{if(reader)for(;;){touch();const p=await reader.read();if(p.done)break;if(size+p.value.length>expected){await reader.cancel();throw Error('Pinned resource exceeds length')}data.set(p.value,size);size+=p.value.length;}}finally{reader?.releaseLock()}
    if(size!==expected)throw Error('Pinned resource body truncated');return {data,full};
   }catch(error){controller.abort();if(attempt++>=retries)throw error;await retryDelay(Math.min(4000,500*2**(attempt-1)));}finally{clearTimeout(timer)}
  }
 }
 if(row.bytes){for(let offset=0;offset<row.bytes;offset+=chunkBytes){const result=await part(offset,Math.min(row.bytes-1,offset+chunkBytes-1));if(result.full){output.set(result.data);break}output.set(result.data,offset);}}
 const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',output))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(sha!==row.sha256)throw Error('Pinned resource checksum differs');return output;
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
  if(resolver){
   const row=resolver.row(file.path);if(row.sha256!==file.sha256)throw Error('Direct engine fingerprint differs');
   verified.set(file.path,await readPinnedResource(row,{fetcher}));continue;
  }
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
