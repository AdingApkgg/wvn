// 只用于已登记的 WebGAL Artemis 归档。保留源 hashlist 的别名与可选探测语义，
// 不运行上游的 IndexedDB 预加载器，不把公共资源写进存档数据库。
const extensions=['.png','.PNG','.jpg','.jpeg','.JPG','.JPEG','.psd','.PSD','.ogg','.mja','.ogv','.mp4'];
export async function prepareWebgalResolver(resolver,{fetcher=fetch}={}){
 const row=resolver.row('hashlist.txt'),limit=8*1024**2;
 if(row.bytes>limit)throw Error('WebGAL hashlist exceeds limit');
 const response=await fetcher(row.url,{credentials:'omit',redirect:'error'});
 if(response.status!==200)throw Error('WebGAL hashlist unavailable');
 const chunks=[];let size=0;const reader=response.body?.getReader();
 try{if(reader)for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel();throw Error('WebGAL hashlist exceeds limit')}chunks.push(part.value);}}finally{reader?.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength}
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(hash!==row.sha256||size!==row.bytes)throw Error('WebGAL hashlist checksum differs');
 const hashes=new Map(),aliases=new Map();
 for(const line of new TextDecoder('utf-8',{fatal:true}).decode(bytes).split(/\r?\n/)){
  if(!line)continue;const cut=line.lastIndexOf(','),name=line.slice(0,cut),digest=line.slice(cut+1);
  const parts=name.replace(/\/$/,'').split('/');
  if(cut<1||!/^([a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})$/i.test(digest)||parts.some(p=>!p||p==='.'||p==='..')||/[\\\u0000-\u001f\u007f]/.test(name))throw Error('Invalid WebGAL hashlist entry');
  // 两份源清单还登记了以斜线结尾的目录；它们不是可下载文件。
  if(name.endsWith('/'))continue;
  if(hashes.has(name)&&hashes.get(name)!==digest)throw Error('Conflicting WebGAL hashlist entry');hashes.set(name,digest);
  if(hashes.size>100000)throw Error('WebGAL hashlist exceeds entry limit');
 }
 if(!hashes.size)throw Error('Empty WebGAL hashlist');
 for(const ext of extensions)for(const [name,digest]of hashes){
  if(!name.endsWith(ext)||name.length<=ext.length)continue;const base=name.slice(0,-ext.length);
  if(aliases.has('res/'+base)||hashes.has(base)&&hashes.get(base)!==digest||!resolver.files.has('res/'+name))continue;
  aliases.set('res/'+base,'res/'+name);
 }
 function target(value,relative){const path=resolver.path(String(value),relative);return aliases.get(path)??path;}
 return {...resolver,row(value,relative){return resolver.row(target(value,relative))},url(value,relative){
  if(/^(?:data:|blob:)/i.test(String(value))||String(value).startsWith('#')||value==='')return resolver.url(value,relative);
  return resolver.url(target(value,relative));
 },missingMedia(value){
  if(!value||/^(?:data:|blob:)/i.test(String(value)))return false;
  const path=resolver.path(String(value));return /^movie(?:_[a-z0-9]+)?\/.+\.(?:mp4|ogv|webm)$/i.test(path)&&!resolver.files.has(path);
 },optionalMissing(value){
  // 索引还包含包内文件。没有独立对象的 res/ 读取保留源 HTTP 的 404
  // 语义，让原生引擎执行包内回退；不能将这个正常分支变成 JS 异常。
  const url=new URL(String(value),resolver.base);url.pathname=url.pathname.replace(/\/+$/,'');
  const base=new URL(resolver.base);
  if(url.origin===base.origin&&(url.pathname==='/'||url.pathname===base.pathname.replace(/\/$/,'')))return true;
  let path;try{path=resolver.path(url.href)}catch(error){
   // 目录探测可带重复斜线；仅当前游戏 res/ 范围返回不存在，不能放宽 URL 边界。
   if(url.origin===base.origin&&url.pathname.startsWith(base.pathname+'res/'))return true;
   throw Error(error.message+' ['+String(value).slice(0,300)+']',{cause:error});
  }
  return (path==='res'||path.startsWith('res/'))&&!resolver.files.has(path)&&!aliases.has(path);
 }};
}
export function installWebgalProbeFallback(win,resolver){
 const nativeFetch=win.fetch.bind(win),prototype=win.XMLHttpRequest.prototype;
 const open=prototype.open,send=prototype.send,abort=prototype.abort,pending=new WeakMap();
 const responseKeys=['readyState','status','statusText','response','responseText'];
 function clearResponse(xhr){for(const key of responseKeys)delete xhr[key];}
 win.fetch=(input,options)=>{
  const url=typeof input==='string'?input:input.url;
  if(String(options?.method??input?.method??'GET').toUpperCase()==='GET'&&resolver.optionalMissing(url))return Promise.resolve(new win.Response('',{status:404}));
  return nativeFetch(input,options);
 };
 prototype.open=function(method,url,...args){
  const previous=pending.get(this);if(previous){previous.aborted=true;clearResponse(this);}
  pending.delete(this);
  if(String(method).toUpperCase()==='GET'&&resolver.optionalMissing(url)){
   pending.set(this,{aborted:false});return;
  }
  // 对未知核心文件保持拒绝；只有 hashlist 之外的 res/ 探测返回 404。
  return open.call(this,method,url,...args);
 };
 prototype.send=function(...args){
  const state=pending.get(this);if(!state)return send.apply(this,args);
  queueMicrotask(()=>{if(state.aborted)return;
   for(const [key,value]of Object.entries({readyState:4,status:404,statusText:'Not Found',response:new ArrayBuffer(0),responseText:''}))Object.defineProperty(this,key,{configurable:true,value});
   this.dispatchEvent(new win.Event('readystatechange'));this.dispatchEvent(new win.ProgressEvent('load'));this.dispatchEvent(new win.ProgressEvent('loadend'));
  });
 };
 prototype.abort=function(...args){const state=pending.get(this);if(state){state.aborted=true;clearResponse(this);pending.delete(this);this.dispatchEvent(new win.ProgressEvent('abort'));this.dispatchEvent(new win.ProgressEvent('loadend'));return}return abort.apply(this,args)};
 // 源站部分包不提供可选片头。保留媒体 error 分支，不产生未登记网络请求，
 // 也不向引擎提供伪造的成功正文；现有视频仍交给严格 CAS 映射。
 const media=win.HTMLMediaElement?.prototype;if(media){
  const source=Object.getOwnPropertyDescriptor(media,'src'),setAttribute=media.setAttribute,tokens=new WeakMap();
  function missing(node,value){
   tokens.delete(node);if(!resolver.missingMedia(String(value)))return false;
   const token={};tokens.set(node,token);queueMicrotask(()=>{if(tokens.get(node)===token)node.dispatchEvent(new win.Event('error'))});return true;
  }
  if(source?.set)Object.defineProperty(media,'src',{...source,set(value){if(!missing(this,value))source.set.call(this,value)}});
  media.setAttribute=function(name,value){if(String(name).toLowerCase()==='src'&&missing(this,value))return;return setAttribute.call(this,name,value)};
  const play=media.play;if(play)media.play=function(...args){
   const result=play.apply(this,args);return result?.catch?result.catch(error=>{
    // 跳过片头会主动 pause；只消化这个确定的取消分支，真实媒体错误继续拒绝。
    if(error.name==='AbortError'&&this.paused)return;throw error;
   }):result;
  };
 }
}
