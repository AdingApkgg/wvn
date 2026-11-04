// 只为即将按原顺序执行的已登记脚本预热连接；不执行脚本，不缓存用户数据。
export function createScriptPreloader({resolve,create,mount,remove,prepare,maxFiles=2,maxBytes=1024**2}){
 const active=new Map();let bytes=0;
 function release(url){const item=active.get(url);if(!item)return;active.delete(url);bytes-=item.bytes;item.controller?.abort();if(item.node)remove(item.node)}
 return {
  warm(paths){
   for(const path of paths){
    if(active.size>=maxFiles)break;
    const row=resolve(path);if(active.has(row.url)||!Number.isSafeInteger(row.bytes)||row.bytes<0||row.bytes>maxBytes-bytes)continue;
    const item={bytes:row.bytes};active.set(row.url,item);bytes+=row.bytes;
    const attach=()=>{if(active.get(row.url)!==item)return;item.node=create(row);mount(item.node)};
    if(prepare){
     item.controller=new AbortController();
     // 公共缓存接入时先走同一校验/抢占队列；不能另起CDN hint后又切Blob重复下载。
     try{Promise.resolve(prepare(row.path??path,item.controller.signal)).then(attach).catch(()=>{if(active.get(row.url)===item)release(row.url)})}catch{release(row.url)}
    }else attach();
   }
  },
  release(path){release(resolve(path).url)},
  close(){for(const url of [...active.keys()])release(url)},
 };
}
