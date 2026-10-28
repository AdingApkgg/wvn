import {createHash} from 'node:crypto';

class InvalidResource extends Error {}

export async function fetchResourceHeaders(url,{method='GET',headers,signal,timeoutMs=60000}={}){
 if(!['GET','HEAD'].includes(method)||!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw TypeError('Invalid resource request');
 signal?.throwIfAborted();const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(new DOMException('Resource response header timeout','TimeoutError')),timeoutMs);timer.unref?.();
 try{return await fetch(url,{method,headers,redirect:'error',signal:signal?AbortSignal.any([signal,controller.signal]):controller.signal});}
 finally{clearTimeout(timer);}
}

// 一次尝试包含响应头、完整响应体和摘要校验；绝不把截断数据返回调用方。
export async function readVerifiedResource(load,{sha256,signal,maxBytes=128*1024**2,attempts=3,timeoutMs=60000,onAttempt}={}){
 if(!Number.isInteger(attempts)||attempts<1||attempts>3||!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||sha256!==undefined&&!/^[a-f0-9]{64}$/.test(sha256))throw TypeError('Invalid verified resource limits');
 for(let attempt=1;attempt<=attempts;attempt++){
  signal?.throwIfAborted();
  const deadline=AbortSignal.timeout(timeoutMs),attemptSignal=signal?AbortSignal.any([signal,deadline]):deadline;
  try{
   const response=await load({signal:attemptSignal,attempt});
   onAttempt?.({attempt,phase:'headers',status:response.status});
   if(response.status!==200){
    await response.body?.cancel();
    if(response.status>=500&&response.status<=599)throw Error('Resource unavailable: '+response.status);
    throw new InvalidResource('Resource unavailable: '+response.status);
   }
   const length=response.headers.get('content-length'),expected=length&&/^\d+$/.test(length)?Number(length):null;
   if(expected!==null&&expected>maxBytes){await response.body?.cancel();throw new InvalidResource('Resource exceeds size limit');}
   const chunks=[];let total=0;const reader=response.body?.getReader();
   try{
    if(reader)for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){await reader.cancel();throw new InvalidResource('Resource exceeds size limit');}chunks.push(Buffer.from(value));}
   }finally{reader?.releaseLock();}
   if(expected!==null&&total!==expected)throw Error('Resource body was interrupted');
   const bytes=Buffer.concat(chunks,total);
   if(sha256&&createHash('sha256').update(bytes).digest('hex')!==sha256)throw new InvalidResource('Resource checksum differs');
   onAttempt?.({attempt,phase:'complete',bytes:total});return bytes;
  }catch(error){
   onAttempt?.({attempt,phase:'failed',error});
   if(error instanceof InvalidResource||signal?.aborted||attempt===attempts)throw error;
   await new Promise(resolve=>setTimeout(resolve,attempt*200));
  }
 }
}
