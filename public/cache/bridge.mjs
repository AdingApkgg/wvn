const expected=document.querySelector('meta[name="wvn-parent-origin"]').content;
let initialized=false;
addEventListener('message',event=>{
 const data=event.data;if(initialized||event.source!==parent||parent===window||event.origin!==expected||data?.type!=='WVN_CACHE_INIT'||!/^[a-f0-9-]{36}$/.test(data.nonce??'')||event.ports.length!==1)return;
 initialized=true;const port=event.ports[0],worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'}),send=value=>port.postMessage({...value,nonce:data.nonce,planId:data.planId});
 worker.onmessage=({data:value})=>send(value);worker.onerror=()=>send({type:'response',ok:false,error:'资源缓存线程失败'});
 port.onmessage=({data:value})=>{if(value?.nonce!==data.nonce||value.planId!==data.planId)return;worker.postMessage(value)};
 worker.postMessage({type:'init',manifest:data.manifest,entry:data.entry,sharedEngine:data.sharedEngine,planId:data.planId});
 addEventListener('pagehide',()=>{worker.terminate();port.close()},{once:true});
});
