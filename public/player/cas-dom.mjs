import {rewriteCasCss,rewriteCasCssUrls} from './cas-resources.mjs';
// 在浏览器原生请求开始之前同步映射；不使用 MutationObserver 补救已发出的请求。
export function installCasBrowser(win,resolver){
 const doc=win.document,EP=win.Element.prototype,NP=win.Node.prototype;
 const set=EP.setAttribute,remove=EP.removeAttribute,append=NP.appendChild,insert=NP.insertBefore,replace=NP.replaceChild;
 const fragmentMethods=Object.fromEntries(['append','prepend','replaceChildren'].map(name=>[name,win.DocumentFragment.prototype[name]]));
 const inner=Object.getOwnPropertyDescriptor(EP,'innerHTML'),text=Object.getOwnPropertyDescriptor(NP,'textContent');
 const nativeFetch=win.fetch.bind(win),open=win.XMLHttpRequest.prototype.open;
 const pending=new Set(),failures=[],preparedStyles=new WeakSet(),styles=new WeakMap(),links=new WeakMap(),active=new Set();let preparing=0;
 const css=value=>rewriteCasCssUrls(String(value),'index.html',resolver);
 function fetchURL(input){const url=resolver.url(input instanceof win.Request?input.url:input);if(!url)throw Error('Empty network resource URL');return url}
 win.fetch=function(input,options){
  const url=fetchURL(input);return nativeFetch(input instanceof win.Request?new win.Request(url,input):url,{...options,credentials:'omit',redirect:'error'});
 };
 win.XMLHttpRequest.prototype.open=function(method,url,...rest){return open.call(this,method,fetchURL(url),...rest)};
 const credentials=Object.getOwnPropertyDescriptor(win.XMLHttpRequest.prototype,'withCredentials');
 if(credentials?.set)Object.defineProperty(win.XMLHttpRequest.prototype,'withCredentials',{...credentials,set(){credentials.set.call(this,false)}});
 const stateMap=kind=>kind==='style'?styles:links;
 function current(state){return stateMap(state.kind).get(state.node)===state&&!state.controller.signal.aborted;}
 function cancel(node,kind){
  const map=stateMap(kind),state=map.get(node);if(!state)return;map.delete(node);active.delete(state);state.controller.abort();state.cancelLoad?.();
  if(state.blob){win.URL.revokeObjectURL(state.blob);if(node.getAttribute('href')===state.blob)remove.call(node,'href');}
 }
 function begin(node,kind){cancel(node,kind);const state={node,kind,controller:new win.AbortController(),connected:node.isConnected};stateMap(kind).set(node,state);active.add(state);return state;}
 function reconcile(){for(const state of [...active]){if(!current(state)){active.delete(state);continue}if(state.node.isConnected){state.connected=true;state.start?.();}else if(state.connected)cancel(state.node,state.kind);}}
 function schedule(state,run){
  state.start=()=>{if(state.started)return;state.started=true;
   const task=Promise.resolve().then(run).catch(error=>{if(current(state)&&error.name!=='AbortError'){failures.push({state,error});if(!error.nativeEvent)state.node.dispatchEvent(new win.Event('error'));}}).finally(()=>{pending.delete(task);if(state.kind==='style')active.delete(state);});pending.add(task);
  };reconcile();
 }
 async function ready(){reconcile();while(pending.size)await Promise.all([...pending]);const failed=failures.splice(0).find(item=>current(item.state));if(failed)throw failed.error;}
 const cssCache=new Map();
 async function readCSS(path,signal){
  signal.throwIfAborted();if(cssCache.has(path))return cssCache.get(path);
  const row=resolver.files.get(path)??resolver.engines.get(path);if(!row)throw Error('Unregistered stylesheet');if(row.bytes>8*1024**2)throw Error('Stylesheet exceeds limit');
  const response=await nativeFetch(row.url,{credentials:'omit',redirect:'error',signal});if(!response.ok)throw Error('Stylesheet download failed');const value=await response.text();signal.throwIfAborted();if(value.length>8*1024**2)throw Error('Stylesheet exceeds limit');cssCache.set(path,value);return value;
 }
 function inlineStyle(node,value,render=result=>text.set.call(node,result)){
  const state=begin(node,'style');state.source=String(value);preparedStyles.add(node);
  try{const result=css(state.source);render(result);active.delete(state);return;}catch(error){if(error.message!=='CSS import requires preparation'){active.delete(state);throw error;}}
  render('');schedule(state,async()=>{const result=await rewriteCasCss(state.source,'index.html',resolver,path=>readCSS(path,state.controller.signal));if(current(state)&&node.isConnected)render(result);});
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
  });
 }
 // 此观察器只取消已断开的任务；所有 URL 映射仍在同步 DOM/请求入口执行。
 const lifecycle=new win.MutationObserver(reconcile);lifecycle.observe(doc,{subtree:true,childList:true});
 function srcset(value){
  const input=String(value),candidates=[];let cursor=0;
  while(cursor<input.length){
   while(cursor<input.length&&/[\s,]/.test(input[cursor]))cursor++;if(cursor===input.length)break;
   const start=cursor,data=input.slice(cursor,cursor+5).toLowerCase()==='data:';
   while(cursor<input.length&&!/\s/.test(input[cursor])&&(data||input[cursor]!==','))cursor++;
   let source=input.slice(start,cursor);const separated=source.endsWith(',');source=source.replace(/,+$/,'');
   if(!source)continue;
   if(separated){candidates.push(resolver.url(source));continue;}
   const descriptorStart=cursor;while(cursor<input.length&&input[cursor]!==',')cursor++;
   const descriptor=input.slice(descriptorStart,cursor).trim();
   candidates.push(resolver.url(source)+(descriptor?' '+descriptor:''));if(input[cursor]===',')cursor++;
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
   if(node.localName==='link'){
    const rel=node.getAttribute('rel')?.toLowerCase()??'';
    if(rel==='manifest'||rel==='preload'||rel==='prefetch'||rel==='modulepreload'){remove.call(node,'href');return node;}
    if(rel==='stylesheet'&&node.hasAttribute('href')&&node.getAttribute('href')!==links.get(node)?.blob){const href=node.getAttribute('href');stylesheet(node,href);}
   }
   for(const {name,value} of [...node.attributes]){const mapped=attr(node,name,value);if(mapped!==value)set.call(node,name,mapped);}
   if(['img','script','video','audio','link'].includes(node.localName))set.call(node,'crossorigin','anonymous');
   if(node.localName==='style'&&!preparedStyles.has(node)){inlineStyle(node,text.get.call(node));}
  }
  for(const child of [...node.childNodes??[]])prepare(child);return node;
 }
 function linkAttribute(node,name,value){
  if(node.localName!=='link')return false;const key=name.toLowerCase();
  if(key==='href'&&node.rel.toLowerCase().split(/\s+/).includes('stylesheet')){stylesheet(node,String(value));return true;}
  if(key==='rel'){
   const saved=links.get(node)?.href??node.getAttribute('href');cancel(node,'link');
   set.call(node,name,value);
   if(String(value).toLowerCase().split(/\s+/).includes('stylesheet')&&saved)stylesheet(node,saved);
   else if(saved)set.call(node,'href',resolver.url(saved));return true;
  }
  return false;
 }
 EP.setAttribute=function(name,value){if(linkAttribute(this,String(name),String(value)))return;return set.call(this,name,attr(this,name,String(value)));};
 EP.removeAttribute=function(name){if(this.localName==='link'&&['href','rel'].includes(String(name).toLowerCase())){cancel(this,'link');if(String(name).toLowerCase()==='href')remove.call(this,'data-cas-href');}return remove.call(this,name)};
 const setNS=EP.setAttributeNS;EP.setAttributeNS=function(ns,name,value){return setNS.call(this,ns,name,attr(this,name,String(value)))};
 for(const [type,props] of [['HTMLImageElement',['src','srcset']],['HTMLScriptElement',['src']],['HTMLMediaElement',['src']],['HTMLVideoElement',['poster']],['HTMLSourceElement',['src','srcset']],['HTMLTrackElement',['src']],['HTMLInputElement',['src']],['HTMLLinkElement',['href','rel']]]){
  const proto=win[type]?.prototype;if(!proto)continue;
  for(const prop of props){const d=Object.getOwnPropertyDescriptor(proto,prop);if(!d?.set)continue;Object.defineProperty(proto,prop,{...d,set(value){
   if(linkAttribute(this,prop,String(value)))return;
   set.call(this,'crossorigin','anonymous');d.set.call(this,attr(this,prop,String(value)));
  }});}
 }
 function styleMutation(node,method,args){
  const state=styles.get(node),source=state?.source??text.get.call(node),container=doc.createDocumentFragment();cancel(node,'style');
  while(node.firstChild)append.call(container,node.firstChild);
  const write=value=>{let first=[...container.childNodes].find(child=>child.nodeType===3);if(!first){first=doc.createTextNode('');append.call(container,first);}for(const child of container.childNodes)text.set.call(child,child===first?value:'');return first;};
  write(source);
  const original=method==='appendChild'?append:method==='insertBefore'?insert:method==='replaceChild'?replace:fragmentMethods[method];
  const result=original.apply(container,args),next=text.get.call(container);let first;
  inlineStyle(node,next,value=>{if(!first)first=write(value);else text.set.call(first,value)});
  append.call(node,container);reconcile();return result;
 }
 function fragment(html){const template=doc.createElement('template');inner.set.call(template,String(html));prepare(template.content);return template.content}
 Object.defineProperty(EP,'innerHTML',{...inner,set(value){if(this.localName==='style')return inlineStyle(this,String(value));if(this.localName==='template'||preparing)return inner.set.call(this,value);const content=fragment(value);while(this.firstChild)this.removeChild(this.firstChild);append.call(this,content);reconcile();}});
 const outer=Object.getOwnPropertyDescriptor(EP,'outerHTML');if(outer?.set)Object.defineProperty(EP,'outerHTML',{...outer,set(value){if(!this.parentNode)return;const content=fragment(value);insert.call(this.parentNode,content,this);this.remove()}});
 EP.insertAdjacentHTML=function(position,html){const content=fragment(html);switch(position.toLowerCase()){case 'beforebegin':insert.call(this.parentNode,content,this);break;case 'afterbegin':insert.call(this,content,this.firstChild);break;case 'beforeend':append.call(this,content);break;case 'afterend':insert.call(this.parentNode,content,this.nextSibling);break;default:throw Error('Invalid insertion position')}reconcile();};
 for(const method of ['appendChild','insertBefore','replaceChild']){const original=NP[method];NP[method]=function(node,...args){if(this.nodeType===1&&this.localName==='style')return styleMutation(this,method,[node,...args]);const result=original.call(this,prepare(node),...args);reconcile();return result;};}
 for(const proto of [EP,win.DocumentFragment.prototype,win.Document.prototype])for(const method of ['append','prepend','replaceChildren','before','after','replaceWith']){const original=proto[method];if(original)proto[method]=function(...nodes){if(this.nodeType===1&&this.localName==='style'&&fragmentMethods[method])return styleMutation(this,method,nodes);const result=original.apply(this,nodes.map(prepare));reconcile();return result;};}
 const removeChild=NP.removeChild;NP.removeChild=function(node){const result=removeChild.call(this,node);reconcile();return result;};
 const removeElement=EP.remove;EP.remove=function(){const result=removeElement.call(this);reconcile();return result;};
 Object.defineProperty(NP,'textContent',{...text,set(value){if(this.nodeType===1&&this.localName==='style')return inlineStyle(this,String(value));return text.set.call(this,value)}});
 const CSP=win.CSSStyleDeclaration.prototype,property=CSP.setProperty;
 CSP.setProperty=function(name,value,priority){return property.call(this,name,css(value),priority)};
 for(const name of Object.getOwnPropertyNames(CSP)){const d=Object.getOwnPropertyDescriptor(CSP,name);if(d?.set&&d.configurable)Object.defineProperty(CSP,name,{...d,set(value){return d.set.call(this,css(value))}})}
 const styleViews=new WeakMap();
 for(const proto of [win.HTMLElement.prototype,win.SVGElement?.prototype]){if(!proto)continue;const descriptor=Object.getOwnPropertyDescriptor(proto,'style');if(!descriptor?.get)continue;Object.defineProperty(proto,'style',{...descriptor,...(descriptor.set?{set(value){return descriptor.set.call(this,css(value))}}:{}),get(){const style=descriptor.get.call(this);if(!styleViews.has(style))styleViews.set(style,new Proxy(style,{get(target,key){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value},set(target,key,value){return Reflect.set(target,key,typeof value==='string'?css(value):value,target)}}));return styleViews.get(style)}});}
 const rules=win.CSSStyleSheet.prototype,insertRule=rules.insertRule;
 for(const method of ['replace','replaceSync']){const original=rules[method];if(original)rules[method]=function(value){return original.call(this,rewriteCasCssUrls(String(value),'index.html',resolver,{ignoreImports:true}))};}
 rules.insertRule=function(rule,...args){return insertRule.call(this,css(rule),...args)};
 const Audio=win.Audio;if(Audio){win.Audio=function(src){const node=new Audio();set.call(node,'crossorigin','anonymous');if(src!==undefined)node.src=src;return node};win.Audio.prototype=Audio.prototype;}
 return {
  resolver,
  async restoreDocument(){const template=doc.getElementById('wg-cas-document');if(template){preparing++;try{const content=prepare(template.content),body=content.querySelector('[data-cas-body]');if(body){for(const {name,value} of [...body.attributes])if(name!=='data-cas-body')set.call(doc.body,name,attr(doc.body,name,value));while(body.firstChild)insert.call(body.parentNode,body.firstChild,body);body.remove();}append.call(doc.body,content);template.remove();}finally{preparing--}}await ready();},
  ready,
 };
}
