import {rewriteCasCss,rewriteCasCssUrls} from './cas-resources.mjs';
// 在浏览器原生请求开始之前同步映射；不使用 MutationObserver 补救已发出的请求。
export function installCasBrowser(win,resolver){
 const doc=win.document,EP=win.Element.prototype,NP=win.Node.prototype;
 const set=EP.setAttribute,remove=EP.removeAttribute,append=NP.appendChild,insert=NP.insertBefore;
 const inner=Object.getOwnPropertyDescriptor(EP,'innerHTML'),text=Object.getOwnPropertyDescriptor(NP,'textContent');
 const nativeFetch=win.fetch.bind(win),open=win.XMLHttpRequest.prototype.open;
 const pending=new Set(),preparedStyles=new WeakSet(),linkVersions=new WeakMap(),linkBlobs=new WeakMap();let preparing=0;
 const css=value=>rewriteCasCssUrls(String(value),'index.html',resolver);
 function fetchURL(input){return resolver.url(input instanceof win.Request?input.url:input)}
 win.fetch=function(input,options){
  const url=fetchURL(input);return nativeFetch(input instanceof win.Request?new win.Request(url,input):url,{...options,credentials:'omit',redirect:'error'});
 };
 win.XMLHttpRequest.prototype.open=function(method,url,...rest){return open.call(this,method,resolver.url(url),...rest)};
 const credentials=Object.getOwnPropertyDescriptor(win.XMLHttpRequest.prototype,'withCredentials');
 if(credentials?.set)Object.defineProperty(win.XMLHttpRequest.prototype,'withCredentials',{...credentials,set(){credentials.set.call(this,false)}});
 function inlineStyle(node,value){
  if(/@import\b/i.test(value)){text.set.call(node,'');track(rewriteCasCss(String(value),'index.html',resolver,readCSS).then(result=>text.set.call(node,result))).catch(()=>node.dispatchEvent(new win.Event('error')));}
  else text.set.call(node,css(value));preparedStyles.add(node);
 }
 const cssCache=new Map();
 async function readCSS(path){
  if(!cssCache.has(path))cssCache.set(path,(async()=>{const row=resolver.files.get(path)??resolver.engines.get(path);if(!row)throw Error('Unregistered stylesheet');const response=await nativeFetch(row.url,{credentials:'omit',redirect:'error'});if(!response.ok)throw Error('Stylesheet download failed');const value=await response.text();if(value.length>8*1024**2)throw Error('Stylesheet exceeds limit');return value})());
  return cssCache.get(path);
 }
 function track(promise){pending.add(promise);promise.finally(()=>pending.delete(promise)).catch(()=>{});return promise}
 function stylesheet(node,href){
  const generation=(linkVersions.get(node)??0)+1;linkVersions.set(node,generation);remove.call(node,'href');set.call(node,'data-cas-href',href);
  const path=resolver.row(href).path;
  const task=track((async()=>{
   const value=await rewriteCasCss(await readCSS(path),path,resolver,readCSS);
   if(linkVersions.get(node)!==generation)return;
   const previous=linkBlobs.get(node);if(previous)win.URL.revokeObjectURL(previous);
   const blob=win.URL.createObjectURL(new win.Blob([value],{type:'text/css'}));linkBlobs.set(node,blob);
   // 改写后的 CSS 交还原生 link；保留 sheet/media/disabled 与 load/error 语义。
   await new Promise((resolve,reject)=>{
    const clear=()=>{node.removeEventListener('load',loaded);node.removeEventListener('error',failed)};
    const loaded=()=>{clear();resolve()},failed=()=>{clear();reject(Error('Stylesheet load failed'))};
    node.addEventListener('load',loaded,{once:true});node.addEventListener('error',failed,{once:true});
    set.call(node,'href',blob);
   });
  })());task.catch(()=>{});return task;
 }
 function srcset(value){return String(value).split(/,\s*(?![^\s]*,)/).map(part=>{const m=/^(\s*)(\S+)(.*)$/.exec(part);if(!m)return part;return m[1]+resolver.url(m[2])+m[3]}).join(', ')}
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
    if(rel==='stylesheet'&&node.hasAttribute('href')&&node.getAttribute('href')!==linkBlobs.get(node)){const href=node.getAttribute('href');stylesheet(node,href);}
   }
   for(const {name,value} of [...node.attributes]){const mapped=attr(node,name,value);if(mapped!==value)set.call(node,name,mapped);}
   if(['img','script','video','audio','link'].includes(node.localName))set.call(node,'crossorigin','anonymous');
   if(node.localName==='style'&&!preparedStyles.has(node)){inlineStyle(node,text.get.call(node));}
  }
  for(const child of [...node.childNodes??[]])prepare(child);return node;
 }
 EP.setAttribute=function(name,value){
  if(this.localName==='link'&&name.toLowerCase()==='rel'&&String(value).toLowerCase()==='stylesheet'&&this.hasAttribute('href'))stylesheet(this,this.getAttribute('href'));
  if(this.localName==='link'&&name.toLowerCase()==='href'&&this.rel==='stylesheet'){stylesheet(this,String(value));return;}
  return set.call(this,name,attr(this,name,String(value)));
 };
 const setNS=EP.setAttributeNS;EP.setAttributeNS=function(ns,name,value){return setNS.call(this,ns,name,attr(this,name,String(value)))};
 for(const [type,props] of [['HTMLImageElement',['src','srcset']],['HTMLScriptElement',['src']],['HTMLMediaElement',['src']],['HTMLVideoElement',['poster']],['HTMLSourceElement',['src','srcset']],['HTMLTrackElement',['src']],['HTMLInputElement',['src']],['HTMLLinkElement',['href','rel']]]){
  const proto=win[type]?.prototype;if(!proto)continue;
  for(const prop of props){const d=Object.getOwnPropertyDescriptor(proto,prop);if(!d?.set)continue;Object.defineProperty(proto,prop,{...d,set(value){
   if(this.localName==='link'&&prop==='rel'&&String(value).toLowerCase()==='stylesheet'&&this.hasAttribute('href'))stylesheet(this,this.getAttribute('href'));
   if(this.localName==='link'&&this.rel==='stylesheet'&&prop==='href'){stylesheet(this,String(value));return;}
   set.call(this,'crossorigin','anonymous');d.set.call(this,attr(this,prop,String(value)));
  }});}
 }
 function fragment(html){const template=doc.createElement('template');inner.set.call(template,String(html));prepare(template.content);return template.content}
 Object.defineProperty(EP,'innerHTML',{...inner,set(value){if(this.localName==='style')return inlineStyle(this,String(value));if(this.localName==='template'||preparing)return inner.set.call(this,value);const content=fragment(value);while(this.firstChild)this.removeChild(this.firstChild);append.call(this,content)}});
 const outer=Object.getOwnPropertyDescriptor(EP,'outerHTML');if(outer?.set)Object.defineProperty(EP,'outerHTML',{...outer,set(value){if(!this.parentNode)return;const content=fragment(value);insert.call(this.parentNode,content,this);this.remove()}});
 EP.insertAdjacentHTML=function(position,html){const content=fragment(html);switch(position.toLowerCase()){case 'beforebegin':insert.call(this.parentNode,content,this);break;case 'afterbegin':insert.call(this,content,this.firstChild);break;case 'beforeend':append.call(this,content);break;case 'afterend':insert.call(this.parentNode,content,this.nextSibling);break;default:throw Error('Invalid insertion position')}};
 for(const method of ['appendChild','insertBefore','replaceChild']){const original=NP[method];NP[method]=function(node,...args){return original.call(this,prepare(node),...args)}}
 for(const proto of [EP,win.DocumentFragment.prototype,win.Document.prototype])for(const method of ['append','prepend','replaceChildren','before','after','replaceWith']){const original=proto[method];if(original)proto[method]=function(...nodes){return original.apply(this,nodes.map(prepare))}}
 Object.defineProperty(NP,'textContent',{...text,set(value){if(this.nodeType===1&&this.localName==='style')return inlineStyle(this,String(value));return text.set.call(this,value)}});
 const CSP=win.CSSStyleDeclaration.prototype,property=CSP.setProperty;
 CSP.setProperty=function(name,value,priority){return property.call(this,name,css(value),priority)};
 for(const name of Object.getOwnPropertyNames(CSP)){const d=Object.getOwnPropertyDescriptor(CSP,name);if(d?.set&&d.configurable)Object.defineProperty(CSP,name,{...d,set(value){return d.set.call(this,css(value))}})}
 const styleViews=new WeakMap();
 for(const proto of [win.HTMLElement.prototype,win.SVGElement?.prototype]){if(!proto)continue;const descriptor=Object.getOwnPropertyDescriptor(proto,'style');if(!descriptor?.get)continue;Object.defineProperty(proto,'style',{...descriptor,...(descriptor.set?{set(value){return descriptor.set.call(this,css(value))}}:{}),get(){const style=descriptor.get.call(this);if(!styleViews.has(style))styleViews.set(style,new Proxy(style,{get(target,key){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value},set(target,key,value){return Reflect.set(target,key,typeof value==='string'?css(value):value,target)}}));return styleViews.get(style)}});}
 const rules=win.CSSStyleSheet.prototype,insertRule=rules.insertRule;
 rules.insertRule=function(rule,...args){return insertRule.call(this,css(rule),...args)};
 const Audio=win.Audio;if(Audio){win.Audio=function(src){const node=new Audio();set.call(node,'crossorigin','anonymous');if(src!==undefined)node.src=src;return node};win.Audio.prototype=Audio.prototype;}
 return {
  resolver,
  async restoreDocument(){const template=doc.getElementById('wg-cas-document');if(template){preparing++;try{const content=prepare(template.content),body=content.querySelector('[data-cas-body]');if(body){for(const {name,value} of [...body.attributes])if(name!=='data-cas-body')set.call(doc.body,name,attr(doc.body,name,value));while(body.firstChild)insert.call(body.parentNode,body.firstChild,body);body.remove();}append.call(doc.body,content);template.remove();}finally{preparing--}}await Promise.all([...pending]);},
  async ready(){await Promise.all([...pending]);},
 };
}
