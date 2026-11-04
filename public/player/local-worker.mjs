// Worker 不访问来源存储；只有专用端口提供当前运行区的公共资源。
function byteRange(size,headers){
 const value=headers.get('range');let start=0,end=size-1,status=200;
 if(value){const match=/^bytes=(\d*)-(\d*)$/.exec(value);if(!match||!match[1]&&!match[2])return {status:416,start:0,end:-1,bytes:0};
  if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]))}else start=Math.max(0,size-Number(match[2]));
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return {status:416,start:0,end:-1,bytes:0};status=206;
 }
 return {status,start,end,bytes:Math.max(0,end-start+1)};
}
function resourceHeaders(file,range){
 const headers=new Headers({'content-type':file.type||'application/octet-stream','content-length':String(range.bytes),'accept-ranges':'bytes'});
 if(range.status===206)headers.set('content-range',`bytes ${range.start}-${range.end}/${file.size}`);
 if(range.status===416)headers.set('content-range','bytes */'+file.size);return headers;
}
function localWorkerRuntime(config,port,nonce,plan){
 const fallbacks=new Map(config.fallbacks),mappings=new Map(config.entries),files=new Map(config.files),inline=new Map(config.inline),owned=new Set(config.known),pending=new Map();
 const nativeFetch=self.fetch.bind(self),NativeRequest=self.Request,NativeResponse=self.Response;
 function resolve(input){
  const text=input instanceof NativeRequest?input.url:String(input);
  if(text.startsWith('blob:')){if(!owned.has(text))throw Error('Unowned worker Blob URL');return text}
  if(text.startsWith('data:'))return text;
  if(/[\u0000-\u001f\u007f\\]/.test(text))throw Error('Invalid worker resource URL');
  const url=new URL(text,config.base);if(url.username||url.password)throw Error('Untrusted worker resource URL');
  const target=mappings.get(url.href)??mappings.get(url.origin+url.pathname);if(!target)throw Error('Unregistered worker resource');return target;
 }
 function request(type,value={}){
  const id=crypto.randomUUID();return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});port.postMessage({type,nonce,plan,id,...value})});
 }
 port.onmessage=({data})=>{
  if(data?.nonce!==nonce||data.plan!==plan)return;
  if(data.type==='files'){for(const [k,v]of data.entries)mappings.set(k,v);for(const [k,v]of data.files){files.set(k,v);owned.add(k)}for(const [k,v]of data.inline)inline.set(k,v);return}
  const task=pending.get(data.id);if(!task)return;pending.delete(data.id);data.ok?task.resolve(data):task.reject(Error(data.error??'Public resource read failed'));
 };
 self.fetch=async(input,options)=>{
  const target=resolve(input),file=files.get(target),signal=options?.signal??input?.signal;signal?.throwIfAborted();
  if(!file)return nativeFetch(input instanceof NativeRequest?new NativeRequest(target,input):target,{...options,credentials:'omit',redirect:'error'});
  const method=String(options?.method??input?.method??'GET').toUpperCase();if(!['GET','HEAD'].includes(method))throw Error('Cached resources are read only');
  const range=byteRange(file.size,new Headers(options?.headers??input?.headers));let stream=null;
  if(method==='GET'&&range.status!==416&&range.bytes){
   const response=await request('open',{url:target,start:range.start,end:range.end}),readId=response.readId;
   const stop=()=>{void request('cancel',{readId}).catch(()=>{})};let streamController;
   const abort=()=>{stop();streamController?.error(signal.reason??new DOMException('Resource cancelled','AbortError'))};
   if(signal?.aborted){stop();signal.throwIfAborted()}
   stream=new ReadableStream({start(controller){streamController=controller},async pull(controller){try{signal?.throwIfAborted();const chunk=await request('read',{readId});signal?.throwIfAborted();if(chunk.done){signal?.removeEventListener('abort',abort);controller.close()}else controller.enqueue(chunk.bytes)}catch(error){signal?.removeEventListener('abort',abort);stop();controller.error(error)}},cancel(){signal?.removeEventListener('abort',abort);stop()}});
   signal?.addEventListener('abort',abort,{once:true});
  }
  const response=new NativeResponse(stream,{status:range.status,headers:resourceHeaders(file,range)});Object.defineProperty(response,'url',{value:input instanceof NativeRequest?input.url:String(input)});return response;
 };
 self.Request=class extends NativeRequest{constructor(input,options){super(input instanceof NativeRequest?new NativeRequest(resolve(input),input):resolve(input),options)}};
 const proto=self.XMLHttpRequest?.prototype;
 if(proto){
  const open=proto.open,send=proto.send,abort=proto.abort,setHeader=proto.setRequestHeader,getHeader=proto.getResponseHeader,getHeaders=proto.getAllResponseHeaders,override=proto.overrideMimeType,states=new WeakMap(),shadow=['readyState','status','statusText','responseURL','response','responseText'];
  proto.open=function(method,url,...args){
   const target=resolve(url),previous=states.get(this);if(previous){previous.aborted=true;previous.controller?.abort()}states.delete(this);for(const key of shadow)delete this[key];
   const file=files.get(target),bytes=inline.get(target),async=args[0]===undefined?true:!!args[0];
   if(file&&!['GET','HEAD'].includes(String(method).toUpperCase()))throw Error('Cached resources are read only');
   // 大型同步 XHR 保持已登记 CDN 退路，不把这种路径计成本地命中。
   const local=!!file&&(async||bytes);open.call(this,method,local?'data:,':fallbacks.get(target)??target,...args);
   if(local)states.set(this,{target,file,bytes,async,method:String(method).toUpperCase(),headers:new Headers(),readyState:1,status:0,aborted:false,active:false});
  };
  proto.setRequestHeader=function(name,value){setHeader.call(this,name,value);states.get(this)?.headers.append(name,value)};
  proto.overrideMimeType=function(value){override.call(this,value);const state=states.get(this);if(state)state.mime=String(value)};
  proto.getResponseHeader=function(name){const s=states.get(this);return s?.result&&s.readyState>=2?s.result.headers.get(name):getHeader.call(this,name)};
  proto.getAllResponseHeaders=function(){const s=states.get(this);return s?.result&&s.readyState>=2?[...s.result.headers].map(([k,v])=>k+': '+v+'\r\n').join(''):getHeaders.call(this)};
  proto.send=function(body){
   const s=states.get(this);if(!s)return send.call(this,body);if(s.active)throw new DOMException('Request already sent','InvalidStateError');s.active=true;
   const type=this.responseType,current=()=>states.get(this)===s&&!s.aborted,emit=name=>this.dispatchEvent(new Event(name));
   for(const key of shadow)Object.defineProperty(this,key,{configurable:true,get:()=>{if(key==='responseText'&&!['','text'].includes(type))throw new DOMException('Response is not text','InvalidStateError');return key==='responseURL'?s.target:key==='responseText'?s.text??'':key==='response'?s.value??null:key==='statusText'?s.status===206?'Partial Content':s.status===200?'OK':'':s[key]}});
   const finish=(bytes,range)=>{
    if(!current())return;s.result={headers:resourceHeaders(s.file,range)};s.status=range.status;
    if(s.async){s.readyState=2;emit('readystatechange');if(!current())return;s.readyState=3;emit('readystatechange');if(!current())return}
    if(type==='blob')s.value=new Blob([bytes],{type:s.file.type});else if(type==='arraybuffer')s.value=bytes.slice().buffer;else{
     const charset=/charset\s*=\s*([\w-]+)/i.exec(s.mime??s.file.type)?.[1]??'utf-8';
     if(charset.toLowerCase()==='x-user-defined'){const pieces=[];for(let at=0;at<bytes.length;at+=16384)pieces.push(String.fromCharCode(...Array.from(bytes.subarray(at,at+16384),v=>v<128?v:v+0xf700)));s.text=pieces.join('')}
     else s.text=new TextDecoder(charset).decode(bytes);
     if(type==='json'){try{s.value=JSON.parse(s.text)}catch{s.value=null}}else s.value=s.text;
    }
    this.dispatchEvent(new ProgressEvent('progress',{lengthComputable:true,loaded:bytes.length,total:bytes.length}));s.readyState=4;s.active=false;emit('readystatechange');if(current()){emit('load');emit('loadend')}
   };
   const range=byteRange(s.file.size,s.headers);
   if(!s.async){finish(s.method==='HEAD'||range.status===416?new Uint8Array():s.bytes.subarray(range.start,range.end+1),range);return}
   s.controller=new AbortController();void self.fetch(s.target,{method:s.method,headers:s.headers,signal:s.controller.signal}).then(r=>r.arrayBuffer()).then(value=>finish(new Uint8Array(value),range)).catch(()=>{if(current()){s.status=0;s.readyState=4;s.active=false;emit('readystatechange');emit('error');emit('loadend')}});
  };
  proto.abort=function(){const s=states.get(this);if(!s)return abort.call(this);const active=s.active;s.aborted=true;s.controller?.abort();s.active=false;s.status=0;s.value=null;s.text='';s.readyState=0;abort.call(this);if(active){this.dispatchEvent(new Event('readystatechange'));this.dispatchEvent(new ProgressEvent('abort'));this.dispatchEvent(new ProgressEvent('loadend'))}};
  const credentials=Object.getOwnPropertyDescriptor(proto,'withCredentials');if(credentials?.set)Object.defineProperty(proto,'withCredentials',{...credentials,set(){credentials.set.call(this,false)}});
 }
 const toScript=url=>{const target=resolve(url),bytes=inline.get(target);if(!bytes)return target;const parts=[];for(let at=0;at<bytes.length;at+=16384)parts.push(String.fromCharCode(...bytes.subarray(at,at+16384)));return 'data:text/javascript;base64,'+btoa(parts.join(''))};
 const scripts=self.importScripts?.bind(self);if(scripts)self.importScripts=(...urls)=>scripts(...urls.map(toScript));
 // 逻辑寻址不改变 self.origin 或浏览器实际权限。
 try{const location=self.location,logical=new URL(config.base);Object.defineProperty(self,'location',{configurable:true,value:new Proxy(location,{get(target,key){if(key==='toString'||key===Symbol.toPrimitive)return ()=>config.base;if(['href','protocol','host','hostname','port','pathname','search','hash'].includes(key))return logical[key];return Reflect.get(target,key,target)}})})}catch{}
 return {resolve,toScript};
}
function startLocalWorker(nonce,plan,module){
 let initialized=false,ready=false;const queued=[];
 self.addEventListener('message',function control(event){
  const data=event.data;
  if(!initialized&&data?.type==='WVN_LOCAL_WORKER_INIT'&&data.nonce===nonce&&data.plan===plan&&event.ports.length===1){
   initialized=true;event.stopImmediatePropagation();const port=event.ports[0],config=data.config,mapper=localWorkerRuntime(config,port,nonce,plan);
   void(async()=>{try{if(module)await import(mapper.toScript(config.source));else self.importScripts(config.source);ready=true;for(const message of queued.splice(0))self.dispatchEvent(new MessageEvent('message',{data:message.data,ports:message.ports,origin:message.origin}));port.postMessage({type:'ready',nonce,plan,origin:self.origin})}catch(error){port.postMessage({type:'error',nonce,plan,error:String(error.message).slice(0,240)});self.close()}})();return;
  }
  if(!ready){event.stopImmediatePropagation();queued.push(event)}
 },true);
}
export function workerSource({nonce,plan,module}){
 return [byteRange,resourceHeaders,localWorkerRuntime,startLocalWorker].map(fn=>fn.toString()).join('\n')+'\nstartLocalWorker('+[JSON.stringify(nonce),JSON.stringify(plan),String(module)].join(',')+');';
}
