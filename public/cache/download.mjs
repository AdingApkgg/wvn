import {isVerifiedPublicFile} from './store.mjs';
import {sha256} from './vendor/noble-hashes/sha2.js';
const hex=value=>[...value].map(n=>n.toString(16).padStart(2,'0')).join('');
const check=signal=>signal?.throwIfAborted();
const delay=(ms,signal)=>new Promise((resolve,reject)=>{const done=()=>{signal?.removeEventListener('abort',abort);resolve()},timer=setTimeout(done,ms),abort=()=>{clearTimeout(timer);reject(signal.reason)};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()});

// 失败回执只保留有限公开字段，不记录Cookie、认证头或完整错误正文。
export function sanitizeResourceFailure(value){
 if(!value||!Number.isInteger(value.httpStatus)||value.httpStatus<400||value.httpStatus>599)return undefined;
 const result={httpStatus:value.httpStatus};
 for(const key of ['code','requestId','edgeRay'])if(typeof value[key]==='string'&&new RegExp(key==='code'?'^[A-Za-z0-9_.-]{1,80}$':'^[A-Za-z0-9/+_=-]{1,200}$').test(value[key]))result[key]=value[key];
 if(Number.isFinite(value.retryAfterMs)&&value.retryAfterMs>=0&&value.retryAfterMs<=86400000)result.retryAfterMs=value.retryAfterMs;
 if(Number.isInteger(value.bodyBytes)&&value.bodyBytes>=0&&value.bodyBytes<=4096)result.bodyBytes=value.bodyBytes;
 for(const key of ['bodyTruncated','bodyReadFailed'])if(typeof value[key]==='boolean')result[key]=value[key];
 return result;
}
async function resourceFailure(response,signal){
 const hint=response.headers.get('retry-after'),seconds=hint!==null&&/^\d+$/.test(hint)?Number(hint)*1000:NaN,date=hint&&!Number.isFinite(seconds)?Date.parse(hint):NaN;
 const info={httpStatus:response.status,retryAfterMs:Number.isFinite(seconds)?seconds:Number.isFinite(date)?Math.max(0,date-Date.now()):undefined,requestId:response.headers.get('x-amz-request-id')??response.headers.get('x-bz-request-id'),edgeRay:response.headers.get('cf-ray')};
 let reader,text='',bytes=0;
 try{if(response.body){reader=response.body.getReader();for(;;){check(signal);const part=await reader.read();if(part.done)break;const take=part.value.subarray(0,4096-bytes);text+=new TextDecoder().decode(take);bytes+=take.byteLength;if(bytes===4096){info.bodyTruncated=true;break}}}}
 catch(error){check(signal);info.bodyReadFailed=true}
 finally{if(reader){await reader.cancel().catch(()=>{});reader.releaseLock()}}
 check(signal);info.bodyBytes=bytes;
 try{info.code=JSON.parse(text).code}catch{info.code=/<Code>([^<]{1,80})<\/Code>/.exec(text)?.[1]}
 return sanitizeResourceFailure(info);
}

export async function hashBlob(blob,signal){const hash=sha256.create();for(let offset=0;offset<blob.size;offset+=1024**2){check(signal);hash.update(new Uint8Array(await blob.slice(offset,offset+1024**2).arrayBuffer()))}return hex(hash.digest())}

// 暂存块只有在真正持久提交后才可续传；完整摘要通过之前不返回正文。
export async function downloadObject(row,{store,fetcher=fetch,signal,onProgress=()=>{},chunkBytes=1024**2,retries=3,idleMs=30000,retryDelay=delay,foreground=()=>false}={}){
 if(!row||!/^[a-f0-9]{64}$/.test(row.sha256)||row.url!=='https://wvn-s3-zi0.saop.cc/'+row.sha256+'.bin'||!Number.isSafeInteger(row.bytes)||row.bytes<0||!Number.isInteger(chunkBytes)||chunkBytes<1||chunkBytes>4*1024**2)throw Error('Invalid immutable resource');
 check(signal);const found=await store.get(row.sha256,{signal});
 if(found){if(found.size===row.bytes&&(isVerifiedPublicFile(found,row)||await hashBlob(found,signal)===row.sha256))return found;await store.remove(row.sha256)}
 let peakBufferBytes=chunkBytes;let attempt=0;const deadline=Date.now()+1800000;
 for(;;){
  check(signal);let hash=sha256.create(),offset=0;
  try{for await(const part of store.parts(row.sha256)){check(signal);if(part.offset!==offset||part.data.size>chunkBytes||offset+part.data.size>row.bytes)throw Object.assign(Error('Invalid committed chunk sequence'),{name:'CacheCorruptionError'});hash.update(new Uint8Array(await part.data.arrayBuffer()));offset+=part.data.size;}}
  // 续传前的临时读取失败只暂停本次尝试，保留已提交块；明确损坏才从零重新下载。
  catch(error){check(signal);if(error.name!=='CacheCorruptionError')throw error;await store.remove(row.sha256);hash=sha256.create();offset=0;}
  const start=offset,controller=new AbortController(),abort=()=>controller.abort(signal.reason);signal?.addEventListener('abort',abort,{once:true});let timer,reader,byob=false,readBuffer;
  const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(new DOMException('Resource idle timeout','TimeoutError')),Math.min(idleMs,Math.max(1,deadline-Date.now())))};
  try{
   if(Date.now()>deadline)throw new DOMException('Resource total timeout','TimeoutError');
   if(offset<row.bytes){
    const headers=new Headers();if(offset)headers.set('range','bytes='+offset+'-');touch();
    const response=await fetcher(row.url,{headers,credentials:'omit',mode:'cors',redirect:'error',cache:offset?'no-store':'force-cache',priority:foreground()?'high':'low',signal:controller.signal});
    if(response.type==='opaque')throw Error('Opaque resource response');
    if(response.status===429||response.status===503){const details=await resourceFailure(response,signal);if(response.status===429||/^(SlowDown|too_many_requests)$/i.test(details?.code??''))throw Object.assign(Error('资源服务暂时限流，已暂停全量下载；请稍后继续'),{name:'RateLimitError',resourceFailure:details});throw Object.assign(Error('Resource download failed '+response.status),{resourceFailure:details})}
    if(offset){if(response.status!==206||response.headers.get('content-range')!==`bytes ${offset}-${row.bytes-1}/${row.bytes}`||response.headers.get('content-encoding'))throw Error('Resource resume range differs')}
    else if(response.status!==200||response.headers.has('content-range'))throw Error('Resource download failed '+response.status);
    if(!response.body)throw Error('Resource body missing');
    try{reader=response.body.getReader({mode:'byob'});byob=true;readBuffer=new ArrayBuffer(65536)}catch(error){if(!(error instanceof TypeError))throw error;reader=response.body.getReader()}
    let pending=new Uint8Array(chunkBytes),used=0;
    for(;;){
     check(signal);touch();const part=await reader.read(byob?new Uint8Array(readBuffer):undefined);if(part.done)break;if(byob)readBuffer=part.value.buffer;peakBufferBytes=Math.max(peakBufferBytes,chunkBytes+part.value.byteLength);
     for(let at=0;at<part.value.byteLength;){
      const count=Math.min(chunkBytes-used,part.value.byteLength-at);if(offset+used+count>row.bytes)throw Error('Resource exceeds manifest length');
      pending.set(part.value.subarray(at,at+count),used);used+=count;at+=count;
      if(used===chunkBytes){check(signal);await store.append(row,offset,pending);hash.update(pending);offset+=used;used=0;onProgress({loaded:offset,total:row.bytes,committed:offset,peakBufferBytes,readerMode:byob?'byob':'default'});}
     }
    }
    if(offset+used!==row.bytes)throw Error('Resource body truncated');
    if(used){const last=pending.subarray(0,used);check(signal);await store.append(row,offset,last);hash.update(last);offset+=used;}
   }
   check(signal);if(hex(hash.digest())!==row.sha256){await store.remove(row.sha256);throw Error('Resource checksum differs')}
   await store.complete(row);onProgress({loaded:row.bytes,total:row.bytes,committed:row.bytes,peakBufferBytes,readerMode:byob?'byob':'default'});const file=await store.get(row.sha256,{signal});if(!file||file.size!==row.bytes)throw Error('Committed resource disappeared');return file;
  }catch(error){
   controller.abort();check(signal);if(error.name==='QuotaExceededError'||error.name==='RateLimitError'||/checksum|range|manifest|Opaque|download failed 40[134]/i.test(error.message)||attempt++>=retries)throw error;
   await retryDelay(Math.min(4000,500*2**(attempt-1)),signal);
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(reader){void reader.cancel().catch(()=>{});reader.releaseLock()}}
 }
}
