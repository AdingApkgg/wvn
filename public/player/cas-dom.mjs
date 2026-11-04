import {rewriteCasCss,rewriteCasCssUrls,rewriteCasCssParts,rewriteCasCssPartsAsync,applyCasCssCompatibility,prepareAuditedCssFonts,projectCasCssUrls} from './cas-resources.mjs';
import {createScriptPreloader} from './script-preload.mjs';
// 原生字体解码完成才算样式就绪；只用于上面核验范围返回的字体，不改FontFace/CSS。
export async function warmCasFonts(fonts,names,signal){
 for(const name of names){
  signal?.throwIfAborted();if(!fonts?.load)throw Error('Native font loading API unavailable');let abort,timer;
  const stopped=new Promise((_,reject)=>{abort=()=>reject(signal.reason);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();timer=setTimeout(()=>reject(Error('Native font loading timed out')),30000)});
  try{const faces=await Promise.race([Promise.resolve().then(()=>fonts.load('31px '+JSON.stringify(name),'你好')),stopped]);signal?.throwIfAborted();if(!faces.length||faces.some(face=>face.status!=='loaded'))throw Error('Native font did not become ready')}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
 }
}
// 在浏览器原生请求开始之前同步映射；不使用 MutationObserver 补救已发出的请求。
export function installCasBrowser(win,resolver,{prepareScript,prepareFont,prepareResource,clearRenpyVideoSources=false}={}){
 const doc=win.document,EP=win.Element.prototype,NP=win.Node.prototype;
 const set=EP.setAttribute,remove=EP.removeAttribute,append=NP.appendChild,insert=NP.insertBefore,replace=NP.replaceChild;
 const mediaLoad=win.HTMLMediaElement?.prototype.load;
 // RenPy停止独立video时会设src为空；Firefox会把它作为逻辑目录重新请求。
 // 无source子节点时按原生load流程撤销旧资源，不伪造媒体正文或放行目录。
 function clearRenpyVideo(node,name,value){if(!clearRenpyVideoSources||String(name).toLowerCase()!=='src'||value!==''||!win.HTMLVideoElement||!(node instanceof win.HTMLVideoElement)||node.querySelector('source'))return false;remove.call(node,'src');mediaLoad.call(node);return true;}
 const fragmentMethods=Object.fromEntries(['append','prepend','replaceChildren'].map(name=>[name,win.DocumentFragment.prototype[name]]));
 const inner=Object.getOwnPropertyDescriptor(EP,'innerHTML'),text=Object.getOwnPropertyDescriptor(NP,'textContent');
 const nativeFetch=win.fetch.bind(win),open=win.XMLHttpRequest.prototype.open;
 const pending=new Set(),failures=[],preparedStyles=new WeakSet(),styles=new WeakMap(),links=new WeakMap(),paused=new WeakMap(),textSources=new WeakMap(),active=new Set();let preparing=0;
 const relTokens=value=>new Set(String(value??'').replace(/[A-Z]/g,letter=>letter.toLowerCase()).split(/[\t\n\f\r ]+/).filter(Boolean));
 const blockedRel=tokens=>['manifest','preload','prefetch','modulepreload'].some(token=>tokens.has(token));
 const css=value=>rewriteCasCssUrls(String(value),'index.html',resolver);
 function fetchURL(input){const url=resolver.url(input instanceof win.Request?input.url:input);if(!url)throw Error('Empty network resource URL');return url}
 win.fetch=function(input,options){
  if(resolver.fetch)return resolver.fetch(input,options);const url=fetchURL(input);return nativeFetch(input instanceof win.Request?new win.Request(url,input):url,{...options,credentials:'omit',redirect:'error'});
 };
 win.XMLHttpRequest.prototype.open=function(method,url,...rest){return open.call(this,method,fetchURL(url),...rest)};
 const credentials=Object.getOwnPropertyDescriptor(win.XMLHttpRequest.prototype,'withCredentials');
 if(credentials?.set)Object.defineProperty(win.XMLHttpRequest.prototype,'withCredentials',{...credentials,set(){credentials.set.call(this,false)}});
 const stateMap=kind=>kind==='style'?styles:links;
 function current(state){return stateMap(state.kind).get(state.node)===state&&!state.controller.signal.aborted;}
 function cancel(node,kind){
  paused.delete(node);const map=stateMap(kind),state=map.get(node);if(!state)return;map.delete(node);active.delete(state);state.controller.abort();state.cancelLoad?.();
  if(state.blob){win.URL.revokeObjectURL(state.blob);if(node.getAttribute('href')===state.blob)remove.call(node,'href');}
 }
 function pause(state){const saved={kind:state.kind,href:state.href};cancel(state.node,state.kind);paused.set(state.node,saved);if(state.kind==='style')preparedStyles.delete(state.node);}
 function begin(node,kind){cancel(node,kind);const state={node,kind,controller:new win.AbortController(),connected:node.isConnected};stateMap(kind).set(node,state);active.add(state);return state;}
 function reconcile(){for(const state of [...active]){if(!current(state)){active.delete(state);continue}if(state.node.isConnected){state.connected=true;state.start?.();}else if(state.connected)pause(state);}}
 function schedule(state,run){
  state.start=()=>{if(state.started)return;state.started=true;
   const task=Promise.resolve().then(run).catch(error=>{if(current(state)&&error.name!=='AbortError'){failures.push({state,error});if(!error.nativeEvent)state.node.dispatchEvent(new win.Event('error'));}}).finally(()=>{pending.delete(task);if(state.kind==='style')active.delete(state);});pending.add(task);
  };reconcile();
 }
 async function ready(){reconcile();while(pending.size)await Promise.all([...pending]);const failed=failures.splice(0).find(item=>current(item.state));if(failed)throw failed.error;}
 const cssCache=new Map(),nativeFonts=new Map(),compatibility=[];
 async function readCSS(path,signal){
  signal.throwIfAborted();if(cssCache.has(path))return cssCache.get(path);
  const row=resolver.files.get(path)??resolver.engines.get(path);if(!row)throw Error('Unregistered stylesheet');if(row.bytes>8*1024**2)throw Error('Stylesheet exceeds limit');
  const response=await (resolver.fetch??nativeFetch)(resolver.fetch?row.url:resolver.url(row.url),{credentials:'omit',redirect:'error',signal});if(!response.ok)throw Error('Stylesheet download failed');
  const bytes=await response.arrayBuffer();signal.throwIfAborted();if(bytes.byteLength>8*1024**2)throw Error('Stylesheet exceeds limit');
  let digest;
  if(['tyrano/libs/jquery-ui.css','tyrano/font.css','tyrano/css/font.css'].includes(path)){
   digest=[...new Uint8Array(await win.crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');signal.throwIfAborted();
  }
  const value=new TextDecoder().decode(bytes),prepared=digest?applyCasCssCompatibility(value,path,resolver,digest):{text:value};
  if(prepared.applied){compatibility.push(prepared.applied);win.console.info('WVN CSS compatibility',JSON.stringify(prepared.applied));}
  const fonts=await prepareAuditedCssFonts(prepared.text,path,resolver,digest,prepareFont,signal);if(fonts.length)nativeFonts.set(path,fonts);
  // 只准备当前样式表声明的图片；必须先于URL重写，否则旧CSS会永久持有CDN地址。
  if(prepareResource){const images=new Set();projectCasCssUrls(prepared.text,value=>{if(value&&!/^(?:data:|blob:|#)/i.test(value)){const row=resolver.row(value,path);if(/^image\//i.test(row.contentType))images.add(row.url)}return value});for(const url of images){signal.throwIfAborted();await prepareResource(url,signal)}}
  cssCache.set(path,prepared.text);return prepared.text;
 }
 function sourceText(node){const value=text.get.call(node),saved=textSources.get(node);return saved?.rendered===value?saved.source:value;}
 function prepareStyle(node,nodes=[...node.childNodes]){
  const state=begin(node,'style'),parts=nodes.map(sourceText);state.source=parts.join('');preparedStyles.add(node);
  const render=values=>nodes.forEach((child,index)=>{textSources.set(child,{source:parts[index],rendered:values[index]});text.set.call(child,values[index]);});
  try{render(rewriteCasCssParts(parts,'index.html',resolver));active.delete(state);return;}catch(error){if(error.message!=='CSS import requires preparation'){active.delete(state);throw error;}}
  render(parts.map(()=>''));schedule(state,async()=>{const result=await rewriteCasCssPartsAsync(parts,'index.html',resolver,path=>readCSS(path,state.controller.signal));if(current(state)&&node.isConnected)render(result);});
 }
 function inlineStyle(node,value){
  const source=String(value??''),children=source?[doc.createTextNode(source)]:[];
  prepareStyle(node,children);text.set.call(node,'');for(const child of children)append.call(node,child);reconcile();
 }
 function stylesheet(node,href){
  const state=begin(node,'link');state.href=String(href);remove.call(node,'href');set.call(node,'data-cas-href',state.href);
  if(!state.href){active.delete(state);return;}
  const path=resolver.row(state.href).path;
  schedule(state,async()=>{
   const signal=state.controller.signal,value=await rewriteCasCss(await readCSS(path,signal),path,resolver,path=>readCSS(path,signal));
   if(!current(state)||!node.isConnected)return;
   state.blob=win.URL.createObjectURL(new win.Blob([value],{type:'text/css'}));
   await new Promise((resolve,reject)=>{
    const clear=()=>{node.removeEventListener('load',loaded);node.removeEventListener('error',failed);signal.removeEventListener('abort',aborted);state.cancelLoad=null;};
    const loaded=()=>{clear();resolve()},failed=()=>{clear();const error=Error('Stylesheet load failed');error.nativeEvent=true;reject(error)},aborted=()=>{clear();resolve()};
    state.cancelLoad=aborted;signal.addEventListener('abort',aborted,{once:true});node.addEventListener('load',loaded,{once:true});node.addEventListener('error',failed,{once:true});set.call(node,'href',state.blob);
   });
   if(current(state))await warmCasFonts(doc.fonts,nativeFonts.get(path)??[],signal);
  });
 }
 // 此观察器只取消已断开的任务；所有 URL 映射仍在同步 DOM/请求入口执行。
 const lifecycle=new win.MutationObserver(reconcile);lifecycle.observe(doc,{subtree:true,childList:true});
 function srcset(value,resolve=resolver.url){
  const input=String(value),candidates=[];let cursor=0;
  while(cursor<input.length){
   while(cursor<input.length&&/[\s,]/.test(input[cursor]))cursor++;if(cursor===input.length)break;
   const start=cursor,data=input.slice(cursor,cursor+5).toLowerCase()==='data:';
   while(cursor<input.length&&!/\s/.test(input[cursor])&&(data||input[cursor]!==','))cursor++;
   let source=input.slice(start,cursor);const separated=source.endsWith(',');source=source.replace(/,+$/,'');
   if(!source)continue;
   if(separated){candidates.push(resolve(source));continue;}
   const descriptorStart=cursor;while(cursor<input.length&&input[cursor]!==',')cursor++;
   const descriptor=input.slice(descriptorStart,cursor).trim();
   candidates.push(resolve(source)+(descriptor?' '+descriptor:''));if(input[cursor]===',')cursor++;
  }
  return candidates.join(', ');
 }
 function attr(node,name,value){
  const tag=node.localName,nameLower=name.toLowerCase();
  if(nameLower==='style')return css(value);
  if(nameLower==='srcset')return srcset(value);
  if(nameLower==='src'||nameLower==='poster'||nameLower==='background'||nameLower==='href'&&['link','image','use'].includes(tag)||nameLower==='xlink:href'&&['image','use'].includes(tag))return resolver.url(value);
  return value;
 }
 function prepare(node){
  if(!node||typeof node==='string')return node;
  if(node.nodeType===1){
   if(node.localName==='base')return node;
   const suspended=paused.get(node);if(suspended?.kind==='link')stylesheet(node,suspended.href);
   if(node.localName==='link'){
    const tokens=relTokens(node.getAttribute('rel'));
    if(!tokens.has('stylesheet')&&blockedRel(tokens)){remove.call(node,'href');return node;}
    if(tokens.has('stylesheet')&&node.hasAttribute('href')&&node.getAttribute('href')!==links.get(node)?.blob){const href=node.getAttribute('href');stylesheet(node,href);}
   }
   for(const {name,value} of [...node.attributes]){const mapped=attr(node,name,value);if(mapped!==value)set.call(node,name,mapped);}
   if(['img','script','video','audio','link'].includes(node.localName))set.call(node,'crossorigin','anonymous');
   if(node.localName==='style'&&!preparedStyles.has(node)){prepareStyle(node);}
  }
  for(const child of [...node.childNodes??[]])prepare(child);return node;
 }
 function linkAttribute(node,name,value){
  if(node.localName!=='link')return false;const key=name.toLowerCase();
  if(key==='href'&&relTokens(node.getAttribute('rel')).has('stylesheet')){stylesheet(node,String(value));return true;}
  if(key==='rel'){
   const saved=links.get(node)?.href??node.getAttribute('href')??node.getAttribute('data-cas-href');cancel(node,'link');
   const tokens=relTokens(value);remove.call(node,'href');set.call(node,name,value);
   if(tokens.has('stylesheet')&&saved)stylesheet(node,saved);
   else if(saved)set.call(node,'href',resolver.url(saved));return true;
  }
  return false;
 }
 EP.setAttribute=function(name,value){if(clearRenpyVideo(this,name,String(value)))return;if(linkAttribute(this,String(name),String(value)))return;return set.call(this,name,attr(this,name,String(value)));};
 EP.removeAttribute=function(name){if(this.localName==='link'&&['href','rel'].includes(String(name).toLowerCase())){cancel(this,'link');if(String(name).toLowerCase()==='href')remove.call(this,'data-cas-href');}return remove.call(this,name)};
 const setNS=EP.setAttributeNS;EP.setAttributeNS=function(ns,name,value){if((ns==null||ns==='')&&clearRenpyVideo(this,name,String(value)))return;if((ns==null||ns==='')&&(name==='rel'||name==='href')&&linkAttribute(this,name,String(value)))return;return setNS.call(this,ns,name,attr(this,name,String(value)))};
 for(const [type,props] of [['HTMLImageElement',['src','srcset']],['HTMLScriptElement',['src']],['HTMLMediaElement',['src']],['HTMLVideoElement',['poster']],['HTMLSourceElement',['src','srcset']],['HTMLTrackElement',['src']],['HTMLInputElement',['src']],['HTMLLinkElement',['href','rel']]]){
  const proto=win[type]?.prototype;if(!proto)continue;
  for(const prop of props){const d=Object.getOwnPropertyDescriptor(proto,prop);if(!d?.set)continue;Object.defineProperty(proto,prop,{...d,...(type==='HTMLScriptElement'&&prop==='src'&&d.get&&resolver.logical?{get(){const value=d.get.call(this);try{return value?resolver.logical(value):value}catch{return value}}}:{}),set(value){
   if(clearRenpyVideo(this,prop,String(value))||linkAttribute(this,prop,String(value)))return;
   set.call(this,'crossorigin','anonymous');d.set.call(this,attr(this,prop,String(value)));
  }});}
 }
 // relList原生方法先在脱离文档的列表上执行验证/转换，再统一提交，避免原href抢先加载。
 const relList=Object.getOwnPropertyDescriptor(win.HTMLLinkElement.prototype,'relList'),relOwners=new WeakMap();
 if(relList?.get){
  Object.defineProperty(win.HTMLLinkElement.prototype,'relList',{...relList,get(){const list=relList.get.call(this);relOwners.set(list,this);return list}});
  function changeRelList(list,operation,args){const owner=relOwners.get(list);if(!owner)return operation.apply(list,args);const probe=doc.createElement('link'),before=owner.getAttribute('rel');if(before!==null)set.call(probe,'rel',before);const result=operation.apply(relList.get.call(probe),args),after=probe.getAttribute('rel');if(after!==before)linkAttribute(owner,'rel',after);return result;}
  for(const name of ['add','remove','toggle','replace']){const original=win.DOMTokenList.prototype[name];win.DOMTokenList.prototype[name]=function(...args){return changeRelList(this,original,args)};}
  const value=Object.getOwnPropertyDescriptor(win.DOMTokenList.prototype,'value');Object.defineProperty(win.DOMTokenList.prototype,'value',{...value,set(input){return changeRelList(this,value.set,[input])}});
 }
 function relAttributeValue(node,original,value){
  if(node.nodeType!==2||node.namespaceURI!==null||node.name!=='rel'||node.ownerElement?.localName!=='link')return false;
  const probe=doc.createAttribute('rel');original.call(probe,value);linkAttribute(node.ownerElement,'rel',probe.value);return true;
 }
 const attributeValue=Object.getOwnPropertyDescriptor(win.Attr.prototype,'value');Object.defineProperty(win.Attr.prototype,'value',{...attributeValue,set(value){if(relAttributeValue(this,attributeValue.set,value))return;return attributeValue.set.call(this,value)}});
 function styleText(node){return (node.nodeType===3||node.nodeType===4)&&node.parentNode?.localName==='style';}
 // 使用当前可见字符数据执行原生偏移/空值/返回值语义；惰性片段内完成映射后才重新接入。
 function changeStyleCharacters(style,operation,overwritten=null){
  const before=[...style.childNodes],values=before.map(child=>text.get.call(child));
  const container=doc.createDocumentFragment();while(style.firstChild)append.call(container,style.firstChild);let changed=false;
  try{
   const result=operation(container),after=[...container.childNodes];
   changed=overwritten!==null||before.length!==after.length||before.some((child,index)=>child!==after[index]||text.get.call(child)!==values[index]);
   if(!changed)return result;
   // 异步准备会暂时清空Text；显式setter仍覆盖自身源码，其余仅失效实际改写/删除的节点。
   before.forEach((child,index)=>{if(child===overwritten||child.parentNode!==container||text.get.call(child)!==values[index])textSources.delete(child);});
   prepareStyle(style,after);return result;
  }
  catch(error){if(changed){for(const child of container.childNodes)text.set.call(child,'');preparedStyles.delete(style);}throw error;}
  finally{append.call(style,container);reconcile();}
 }
 function characterOperation(node,original,args,kind='siblings'){
  if(!styleText(node))return original.apply(node,args);
  let normalized;
  if(kind==='siblings'){
   const nodeType=Object.getOwnPropertyDescriptor(NP,'nodeType');normalized=args.map(value=>{try{nodeType.get.call(value);return value;}catch{return doc.createTextNode(value).data;}});
  }else if(kind==='setter'){
   const probe=doc.createTextNode('');original.apply(probe,args);normalized=[data.get.call(probe)];
  }else{
   const required={split:1,appendData:1,insertData:2,deleteData:2,replaceData:3}[kind];
   if(args.length<required)return original.apply(node,args);
   // WebIDL unsigned long与DOMString各转换一次，顺序保持；转换可能修改原节点，因此之后才克隆验证。
   normalized=[];if(kind!=='appendData')normalized.push(args[0]>>>0);
   if(kind==='deleteData'||kind==='replaceData')normalized.push(args[1]>>>0);
   if(['appendData','insertData','replaceData'].includes(kind)){const probe=doc.createTextNode('');nativeAppend.call(probe,args[required-1]);normalized.push(data.get.call(probe));}
  }
  if(!styleText(node))return original.apply(node,normalized);
  if(kind!=='siblings'){const probe=node.cloneNode(false),result=original.apply(probe,normalized);if(kind!=='setter'&&kind!=='split'&&data.get.call(probe)===data.get.call(node))return result;}
  return changeStyleCharacters(node.parentNode,()=>original.apply(node,normalized),kind==='setter'?node:null);
 }
 const character=win.CharacterData.prototype,data=Object.getOwnPropertyDescriptor(character,'data'),nativeAppend=character.appendData;
 Object.defineProperty(character,'data',{...data,set(value){return characterOperation(this,data.set,[value],'setter')}});
 for(const name of ['appendData','insertData','deleteData','replaceData','before','after','replaceWith']){const original=character[name];if(original)character[name]=function(...args){return characterOperation(this,original,args,['appendData','insertData','deleteData','replaceData'].includes(name)?name:'siblings')};}
 for(const name of ['splitText','replaceWholeText']){const original=win.Text.prototype[name];if(original)win.Text.prototype[name]=function(...args){return characterOperation(this,original,args,name==='splitText'?'split':'siblings')};}
 const normalize=NP.normalize;NP.normalize=function(){return this.nodeType===1&&this.localName==='style'?changeStyleCharacters(this,container=>normalize.call(container)):normalize.call(this)};
 function styleMutation(node,method,args){
  const container=doc.createDocumentFragment();cancel(node,'style');
  while(node.firstChild)append.call(container,node.firstChild);
  const original=method==='appendChild'?append:method==='insertBefore'?insert:method==='replaceChild'?replace:method==='removeChild'?removeChild:fragmentMethods[method];
  const result=original.apply(container,args);prepareStyle(node,[...container.childNodes]);
  append.call(node,container);reconcile();return result;
 }
 function fragment(html){const template=doc.createElement('template');inner.set.call(template,String(html));prepare(template.content);return template.content}
 function serializeMarkup(html){
  const source=String(html);if(!resolver.logical||!source.includes('blob:'))return source;
  const project=value=>{if(!value.startsWith('blob:'))return value;try{return resolver.logical(value)}catch{return value}};
  const template=doc.createElement('template');inner.set.call(template,source);const roots=[template.content];
  // 惰性模板内仅改资源属性与CSS引用，不执行/改写剧情文字、脚本、data属性或未知Blob。
  while(roots.length)for(const node of roots.pop().querySelectorAll('*')){
   if(node.localName==='template')roots.push(node.content);
   for(const attribute of [...node.attributes]){const name=attribute.name.toLowerCase(),tag=node.localName;let value=attribute.value;
    if(name==='style')value=projectCasCssUrls(value,project);
    else if(name==='srcset')value=value.replace(/blob:[^\s"'<>(),;]+/g,project);
    else if(['src','poster','background'].includes(name)||['href','xlink:href'].includes(name)&&['link','image','use'].includes(tag))value=project(value);
    if(value!==attribute.value){if(attribute.namespaceURI)setNS.call(node,attribute.namespaceURI,attribute.name,value);else set.call(node,attribute.name,value)}
   }
   if(node.localName==='style'){const before=text.get.call(node),after=projectCasCssUrls(before,project);if(after!==before)text.set.call(node,after)}
  }
  return inner.get.call(template);
 }
 // 保存层只解析在惰性template中；只准备登记的公共资源，不插入节点、不执行脚本、不改写原HTML。
 async function prepareMarkupResources(html,{signal}={}){
  if(!prepareResource)return;signal?.throwIfAborted();const urls=new Set(),template=doc.createElement('template');inner.set.call(template,String(html));
  const collect=value=>{if(!value||/^(?:data:|#)/i.test(value))return value;if(/^blob:/i.test(value)){resolver.url(value);return value}urls.add(resolver.row(value).url);return value},roots=[template.content];
  while(roots.length)for(const node of roots.pop().querySelectorAll('*')){
   if(node.localName==='template')roots.push(node.content);
   for(const {name,value} of [...node.attributes]){
    const key=name.toLowerCase();if(key==='style')projectCasCssUrls(value,collect);
    else if(key==='srcset')srcset(value,collect);
    else if(['poster','background'].includes(key)||key==='src'&&['img','audio','video','source','input'].includes(node.localName))collect(value);
   }
   if(node.localName==='style')projectCasCssUrls(text.get.call(node),collect);
  }
  for(const url of urls){signal?.throwIfAborted();await prepareResource(url,signal)}
 }
 Object.defineProperty(EP,'innerHTML',{...inner,set(value){if(this.localName==='style')return inlineStyle(this,String(value));if(this.localName==='template'||preparing)return inner.set.call(this,value);const content=fragment(value);while(this.firstChild)this.removeChild(this.firstChild);append.call(this,content);reconcile();}});
 const outer=Object.getOwnPropertyDescriptor(EP,'outerHTML');if(outer?.set)Object.defineProperty(EP,'outerHTML',{...outer,set(value){if(!this.parentNode)return;const content=fragment(value);insert.call(this.parentNode,content,this);this.remove()}});
 EP.insertAdjacentHTML=function(position,html){const content=fragment(html);switch(position.toLowerCase()){case 'beforebegin':insert.call(this.parentNode,content,this);break;case 'afterbegin':insert.call(this,content,this.firstChild);break;case 'beforeend':append.call(this,content);break;case 'afterend':insert.call(this.parentNode,content,this.nextSibling);break;default:throw Error('Invalid insertion position')}reconcile();};
 for(const method of ['appendChild','insertBefore','replaceChild']){const original=NP[method];NP[method]=function(node,...args){if(this.nodeType===1&&this.localName==='style')return styleMutation(this,method,[node,...args]);const result=original.call(this,prepare(node),...args);reconcile();return result;};}
 for(const proto of [EP,win.DocumentFragment.prototype,win.Document.prototype])for(const method of ['append','prepend','replaceChildren','before','after','replaceWith']){const original=proto[method];if(original)proto[method]=function(...nodes){if(this.nodeType===1&&this.localName==='style'&&fragmentMethods[method])return styleMutation(this,method,nodes);const result=original.apply(this,nodes.map(prepare));reconcile();return result;};}
 const removeChild=NP.removeChild;NP.removeChild=function(node){if(this.nodeType===1&&this.localName==='style')return styleMutation(this,'removeChild',[node]);const result=removeChild.call(this,node);reconcile();return result;};
 const removeText=win.CharacterData.prototype.remove;win.CharacterData.prototype.remove=function(){if(this.parentNode?.localName==='style'){styleMutation(this.parentNode,'removeChild',[this]);return;}return removeText.call(this)};
 const removeElement=EP.remove;EP.remove=function(){const result=removeElement.call(this);reconcile();return result;};
 Object.defineProperty(NP,'textContent',{...text,set(value){if(this.nodeType===1&&this.localName==='style')return inlineStyle(this,value);if(relAttributeValue(this,text.set,value))return;return characterOperation(this,text.set,[value],'setter')}});
 const nodeValue=Object.getOwnPropertyDescriptor(NP,'nodeValue');Object.defineProperty(NP,'nodeValue',{...nodeValue,set(value){if(relAttributeValue(this,nodeValue.set,value))return;return characterOperation(this,nodeValue.set,[value],'setter')}});
 const CSP=win.CSSStyleDeclaration.prototype,property=CSP.setProperty;
 CSP.setProperty=function(name,value,priority){return property.call(this,name,css(value),priority)};
 for(const name of Object.getOwnPropertyNames(CSP)){const d=Object.getOwnPropertyDescriptor(CSP,name);if(d?.set&&d.configurable)Object.defineProperty(CSP,name,{...d,set(value){return d.set.call(this,css(value))}})}
 const styleViews=new WeakMap();
 for(const proto of [win.HTMLElement.prototype,win.SVGElement?.prototype]){if(!proto)continue;const descriptor=Object.getOwnPropertyDescriptor(proto,'style');if(!descriptor?.get)continue;Object.defineProperty(proto,'style',{...descriptor,...(descriptor.set?{set(value){return descriptor.set.call(this,css(value))}}:{}),get(){const style=descriptor.get.call(this);if(!styleViews.has(style))styleViews.set(style,new Proxy(style,{get(target,key){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value},set(target,key,value){return Reflect.set(target,key,typeof value==='string'?css(value):value,target)}}));return styleViews.get(style)}});}
 const rules=win.CSSStyleSheet.prototype,insertRule=rules.insertRule;
 for(const method of ['replace','replaceSync']){const original=rules[method];if(original)rules[method]=function(value){return original.call(this,rewriteCasCssUrls(String(value),'index.html',resolver,{ignoreImports:true}))};}
 rules.insertRule=function(rule,...args){return insertRule.call(this,css(rule),...args)};
 const Audio=win.Audio;if(Audio){win.Audio=function(src){const node=new Audio();set.call(node,'crossorigin','anonymous');if(src!==undefined)node.src=src;return node};win.Audio.prototype=Audio.prototype;}
 const Worker=win.Worker;if(Worker&&resolver.workerURL){win.Worker=class extends Worker{constructor(url,options){const source=resolver.workerURL(url,options);super(source,{...options,credentials:'omit'});resolver.attachWorker?.(this,source)}terminate(){resolver.detachWorker?.(this);super.terminate()}};}
 const scriptPreloads=createScriptPreloader({resolve:path=>resolver.row(path),prepare:prepareScript,create:row=>{
  const node=doc.createElement('link');for(const [name,value] of Object.entries({rel:'preload',as:'script',href:resolver.url(row.url),crossorigin:'anonymous',integrity:'sha256-'+win.btoa(String.fromCharCode(...row.sha256.match(/../g).map(h=>parseInt(h,16))))}))set.call(node,name,value);return node;
 },mount:node=>append.call(doc.head,node),remove:node=>{if(node.parentNode)removeChild.call(node.parentNode,node)}});
 return {
  resolver,compatibility,scriptPreloads,serializeMarkup,prepareMarkupResources,
  async restoreDocument(){const carrier=doc.getElementById('wg-cas-document');if(carrier){preparing++;try{
   let template=carrier;
   if(carrier.localName==='script'&&carrier.type==='application/json'){
    const source=JSON.parse(carrier.textContent);if(typeof source!=='string')throw Error('Invalid CAS document');
    template=doc.createElement('template');inner.set.call(template,source);
   }
   if(!template.content)throw Error('Invalid CAS document carrier');
   const content=prepare(template.content),body=content.querySelector('[data-cas-body]');if(body){for(const {name,value} of [...body.attributes])if(name!=='data-cas-body')set.call(doc.body,name,attr(doc.body,name,value));while(body.firstChild)insert.call(body.parentNode,body.firstChild,body);body.remove();}append.call(doc.body,content);carrier.remove();
  }finally{preparing--}}await ready();},
  ready,
 };
}
