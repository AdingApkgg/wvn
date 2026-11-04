export const b2ResourceOrigin='https://wvn-s3-zi0.saop.cc';
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
 let offset=0,first=true,attempt=0;
 // 健康下载使用可复用 HTTP 缓存的整包流；只有断流才补读剩余范围。
 // 清单摘要与大小绑定整包，任何片段都不会提前交给引擎。
 while(offset<row.bytes){
  if(Date.now()>deadline)throw Error('Pinned resource total timeout');
  const start=offset,end=Math.min(row.bytes-1,start+chunkBytes-1),whole=first;first=false;
  const controller=new AbortController();let timer,reader;
  const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(new DOMException('Pinned resource idle timeout','TimeoutError')),Math.min(idleMs,Math.max(1,deadline-Date.now())))};
  try{
   touch();const headers=new Headers();if(!whole)headers.set('range',`bytes=${start}-${end}`);
   const r=await fetcher(row.url,{headers,credentials:'omit',redirect:'error',cache:whole?'force-cache':'no-store',signal:controller.signal});
   if(r.status!==200&&r.status!==206)throw Error('Pinned resource download failed '+r.status);
   const full=r.status===200;
   if(!full&&(whole||r.headers.get('content-range')!==`bytes ${start}-${end}/${row.bytes}`))throw Error('Pinned resource range differs');
   if(!full&&r.headers.get('content-encoding'))throw Error('Pinned resource encoding differs');
   const expected=full?row.bytes:end-start+1;
   // 整包响应可能由 CDN 压缩，CORS 也可能隐藏编码头；解码大小以清单为准。
   if(!full&&r.headers.has('content-length')&&Number(r.headers.get('content-length'))!==expected)throw Error('Pinned resource length differs');
   if(full)offset=0;
   const base=offset;reader=r.body?.getReader();
   if(reader)for(;;){
    touch();const p=await reader.read();if(p.done)break;
    if(offset-base+p.value.length>expected){await reader.cancel();throw Error('Pinned resource exceeds length')}
    output.set(p.value,offset);offset+=p.value.length;
   }
   if(offset-base!==expected)throw Error('Pinned resource body truncated');
   attempt=0;
  }catch(error){
   controller.abort();if(attempt++>=retries)throw error;
   // 已到达声明长度但读取仍报错时必须重读，不能把未正常结束的流当成成功。
   if(offset===row.bytes)offset=start;
   await retryDelay(Math.min(4000,500*2**(attempt-1)));
  }finally{clearTimeout(timer);reader?.releaseLock()}
 }
 const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',output))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(sha!==row.sha256)throw Error('Pinned resource checksum differs');return output;
}
export async function verifyDirectEngine(entry,release,assetOrigin,{fetcher=fetch,resolver}={}){
 if(assetOrigin!==b2ResourceOrigin)return;
 const verified=new Map(),rows=[...(release?.files??Object.entries(entry.engineFiles).map(([path,sha256])=>({path,sha256})))];
 // 已登记的游戏启动包先走可恢复读取，再由原生 getPreloadedPackage 接收。
 if(!release)rows.push(...Object.entries(entry.packageFiles??{}).map(([path,sha256])=>({path,sha256})));
 // 原版RenPy的data包在已验证清单中，却不属于旧三文件引擎指纹组；须在原生加载器执行前单独核验。
 if(!release&&entry.runtimeKind==='RenPy'&&resolver?.files?.has('renpy.data')&&!rows.some(f=>f.path==='renpy.data')){
  const row=resolver.row('renpy.data');rows.push({path:row.path,sha256:row.sha256});
 }
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
