import {createTransferMeter} from './resource-loading.mjs';

export function createOnsResourceClient(port,{pilot,nonce,loading,resources}){
 const pending=new Map();let closed=false;
 return {
  read(key){
   if(closed)return Promise.reject(Error('播放器已关闭'));
   const requestId=crypto.randomUUID(),kind=key==='engine:wasm'?'engine':'game',progress=resources.begin(),meter=createTransferMeter();loading.phase('checking',kind);
   return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(requestId);progress.end(true);reject(Error('资源读取超时'))},180000);pending.set(requestId,{resolve,reject,timer,progress,meter,kind});port.postMessage({type:'ons-resource',pilot,nonce,requestId,key})});
  },
  receive(data){
   if(data?.pilot!==pilot||data.nonce!==nonce||!['ons-resource-progress','ons-resource-result'].includes(data.type))return false;
   const row=pending.get(data.requestId);if(!row)return true;
   if(data.type==='ons-resource-progress'){
    if(Number.isFinite(data.loaded)&&data.loaded>=0){const total=Number.isFinite(data.total)&&data.total>0&&data.loaded<=data.total?data.total:undefined;row.progress.progress(data.loaded,total);loading.download(row.kind,data.loaded,total,row.meter.sample(data.loaded,total))}return true;
   }
   clearTimeout(row.timer);pending.delete(data.requestId);row.progress.end(!data.ok);
   if(!data.ok)row.reject(Error(typeof data.error==='string'?data.error:'资源读取失败'));else if(data.direct)row.resolve(null);else if(data.data instanceof Uint8Array&&data.data.byteLength<=32*1024*1024)row.resolve(data.data);else row.reject(Error('资源内容无效'));return true;
  },
  close(){closed=true;for(const row of pending.values()){clearTimeout(row.timer);row.progress.end();row.reject(Error('播放器已关闭'))}pending.clear()},
 };
}
