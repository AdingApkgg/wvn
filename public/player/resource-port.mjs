// 运行区仅按当前清单内容键请求公共资源，不能传任意URL或账号数据。
export function createResourcePort(port,{pilot,nonce}){
 const pending=new Map();let closed=false;
 return {
  read(sha256,{signal}={}){
   if(closed)return Promise.reject(new DOMException('Resource port closed','AbortError'));
   if(!/^[a-f0-9]{64}$/.test(sha256))return Promise.reject(Error('Invalid public resource key'));signal?.throwIfAborted();if(pending.size>=64)return Promise.reject(Error('Too many public resource requests'));
   const requestId=crypto.randomUUID();return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);pending.delete(requestId)},abort=()=>{cleanup();port.postMessage({type:'cache-resource-cancel',pilot,nonce,requestId});reject(signal.reason)},timer=setTimeout(()=>{cleanup();reject(Error('公共资源读取超时'))},180000);
    pending.set(requestId,{sha256,resolve,reject,cleanup});signal?.addEventListener('abort',abort,{once:true});port.postMessage({type:'cache-resource',pilot,nonce,requestId,sha256});if(signal?.aborted)abort();
   });
  },
  receive(data){
   if(data?.pilot!==pilot||data.nonce!==nonce||data.type!=='cache-resource-result')return false;
   const item=pending.get(data.requestId);if(!item)return true;item.cleanup();
   if(!data.ok){item.reject(Object.assign(Error(String(data.error??'公共资源暂不可用').slice(0,240)),{name:data.name??'Error'}));return true}
   if(data.sha256!==item.sha256||!(data.blob instanceof Blob)&&data.direct!==true){item.reject(Error('Invalid public resource receipt'));return true}item.resolve(data.direct===true?{sha256:data.sha256,direct:true}:{sha256:data.sha256,blob:data.blob});return true;
  },
  close(){if(closed)return;closed=true;for(const item of [...pending.values()]){item.cleanup();item.reject(new DOMException('Resource port closed','AbortError'))}},
 };
}
