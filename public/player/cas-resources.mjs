export const casOrigin='https://wvn-s3-zi0.saop.cc';
const sha=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const validPath=path=>typeof path==='string'&&path.length>0&&path.length<=12288&&!/[\\\u0000-\u001f\u007f]/.test(path)&&path.split('/').every(p=>p&&p!=='.'&&p!=='..');
export function createCasResolver(manifest,entry,{mainOrigin,sharedEngine=true}={}){
 if(manifest?.schema!==1||manifest.delivery!=='cas'||manifest.pilot!==entry.id||manifest.versionId!==entry.versionId||!(uuid.test(manifest.versionId)||/^legacy-[a-f0-9]{24}$/.test(manifest.versionId))||!sha.test(manifest.inventorySha256)||manifest.resourceOrigin!==casOrigin||!Array.isArray(manifest.resources)||!Array.isArray(manifest.engineResources?.files)||manifest.resources.length>60000||manifest.engineResources.files.length>4||JSON.stringify(manifest).length>32*1024**2)throw Error('Invalid CAS manifest');
 const files=new Map(),engines=new Map(),urls=new Map();
 for(const [rows,target] of [[manifest.resources,files],[manifest.engineResources.files,engines]])for(const row of rows){
  if(!validPath(row?.path)||target.has(row.path)||typeof row.key!=='string'||!row.key||!sha.test(row.sha256)||row.url!==casOrigin+'/'+row.sha256+'.bin'||!Number.isSafeInteger(row.bytes)||row.bytes<0||typeof row.contentType!=='string'||!/^[-\w!#$&^.+]+\/[-\w!#$&^.+]+(?:;[^\r\n\u0000]*)?$/.test(row.contentType))throw Error('Invalid CAS resource');
  target.set(row.path,Object.freeze({...row}));urls.set(row.url,row);
 }
 const prefix='/__player/resource/'+entry.id+'/',base=casOrigin+prefix;
 function path(value,relative='index.html'){
  if(typeof value!=='string'||/[\u0000-\u001f\u007f\\]/.test(value))throw Error('Invalid resource URL');
  const url=new URL(value,new URL(relative.split('/').map(encodeURIComponent).join('/'),base));
  if(url.username||url.password||![casOrigin,mainOrigin].includes(url.origin))throw Error('Untrusted resource URL');
  if(urls.has(url.origin+url.pathname)&&!url.search)return urls.get(url.origin+url.pathname).path;
  let encoded=url.pathname;
  if(encoded.startsWith(prefix))encoded=encoded.slice(prefix.length);
  else if(encoded.startsWith('/__engines/resource/'+manifest.engineResources.id+'/'))encoded=encoded.slice(('/__engines/resource/'+manifest.engineResources.id+'/').length);
  else if(encoded.startsWith('/__'))throw Error('Resource escapes current game');
  else encoded=encoded.slice(1);
  const decoded=decodeURIComponent(encoded);if(!validPath(decoded))throw Error('Invalid resource path');return decoded;
 }
 function row(value,relative){const name=path(String(value),relative),result=(sharedEngine?engines.get(name):undefined)??files.get(name);if(!result)throw Error('Unregistered resource: '+name);return result;}
 function url(value,relative){
  const text=String(value);if(!text)return text;if(/^(?:data:|blob:)/i.test(text)||text.startsWith('#'))return text;
  const direct=new URL(text,base);if(urls.has(direct.href))return direct.href;
  return row(text,relative).url;
 }
 return {manifest,files,engines,urls,base,path,row,url};
}
const interruptedManifestBodies=new WeakSet();
export async function readCasManifest(response,entry,options){
 if(!response.ok)throw Error('资源清单不可用');
 const limit=32*1024**2;if(Number(response.headers.get('content-length'))>limit)throw Error('资源清单过大');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){let part;try{part=await reader.read()}catch(error){if(error instanceof TypeError)interruptedManifestBodies.add(error);throw error}const {done,value}=part;if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('资源清单过大')}chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength}
 const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));createCasResolver(manifest,entry,options);return manifest;
}
// 仅公共清单的传输中断限次重读；HTTP拒绝、内容/身份校验失败及主动取消原样失败。
export async function loadCasManifest(entry,{engine,signal,fetcher=globalThis.fetch,...options}={}){
 const url='/api/player/'+encodeURIComponent(entry.id)+'/resources'+(engine?'?engine='+encodeURIComponent(engine):'');
 for(let attempt=0;;attempt++){
  signal?.throwIfAborted();let transportFailure=false;
  try{
   let response;try{response=await fetcher(url,{credentials:'omit',cache:'no-store',redirect:'error',signal})}catch(error){transportFailure=error instanceof TypeError;throw error}
   signal?.throwIfAborted();const manifest=await readCasManifest(response,entry,options);signal?.throwIfAborted();return manifest;
  }catch(error){
   signal?.throwIfAborted();if(attempt!==0||!transportFailure&&!interruptedManifestBodies.has(error))throw error;
   await new Promise((resolve,reject)=>{const done=()=>{signal?.removeEventListener('abort',abort);resolve()},timer=setTimeout(done,200),abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal.reason)};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()});
  }
 }
}
const unescapeCss=value=>value.replace(/\\(?:([a-f\d]{1,6})\s?|([^\r\n\f])|\r?\n)/gi,(_,hex,char)=>hex?String.fromCodePoint(parseInt(hex,16)>0x10ffff||parseInt(hex,16)>=0xd800&&parseInt(hex,16)<=0xdfff?0xfffd:parseInt(hex,16)||0xfffd):char??'');
function stringEnd(text,start){const quote=text[start];let i=start+1;for(;i<text.length;i++){if(text[i]==='\\'){i++;continue}if(text[i]===quote)return i+1}throw Error('Unterminated CSS string')}
function cssName(text,index){
 const match=/^(?:[-_a-z0-9\u0080-\uffff]|\\(?:[a-f0-9]{1,6}[ \t\r\n\f]?|[^\r\n\f]))+/i.exec(text.slice(index));
 return match?{name:unescapeCss(match[0]).toLowerCase(),length:match[0].length}:null;
}
function cssURL(text,index){const name=cssName(text,index);if(name?.name!=='url')return null;const open=/^\s*\(/.exec(text.slice(index+name.length));return open?{length:name.length+open[0].length}:null;}
function cssTokens(text){
 const tokens=[];let i=0;
 const space=()=>{for(;;){while(/\s/.test(text[i]??'')&&i<text.length)i++;if(text.slice(i,i+2)!=='/*')break;const end=text.indexOf('*/',i+2);if(end<0)throw Error('Unterminated CSS comment');i=end+2}};
 function value(){space();if(text[i]==='"'||text[i]==="'"){const start=i;i=stringEnd(text,i);return unescapeCss(text.slice(start+1,i-1));}const start=i;for(;i<text.length&&text[i]!==')';i++)if(text[i]==='\\')i++;return unescapeCss(text.slice(start,i).trim());}
 while(i<text.length){
  if(text.slice(i,i+2)==='/*'){const end=text.indexOf('*/',i+2);if(end<0)throw Error('Unterminated CSS comment');i=end+2;continue}
  if(text[i]==='"'||text[i]==="'"){i=stringEnd(text,i);continue}
  const start=i,name=cssName(text,i),at=text[i]==='@'?cssName(text,i+1):null,imported=at?.name==='import'?{length:at.length+1}:null,url=cssURL(text,i);
  if(imported){i+=imported.length;space();let name;
   const fn=cssURL(text,i);if(fn){i+=fn.length;name=value();space();if(text[i++]!==')')throw Error('Invalid CSS URL')}else if(text[i]==='"'||text[i]==="'")name=value();else throw Error('Invalid CSS import');
   const mediaStart=i;let depth=0;for(;i<text.length;i++){if(text[i]==='"'||text[i]==="'"){i=stringEnd(text,i)-1;continue}if(text[i]==='(')depth++;if(text[i]===')')depth--;if(text[i]===';'&&!depth)break}if(i===text.length)throw Error('Unterminated CSS import');
   tokens.push({start,end:++i,value:name,media:text.slice(mediaStart,i-1).trim(),imported:true});continue;
  }
  if(url){i+=url.length;const name=value();space();if(text[i++]!==')')throw Error('Invalid CSS URL');tokens.push({start,end:i,value:name});continue}
  i+=name?.length??1;
 }
 return tokens;
}
export function rewriteCasCssUrls(text,path,resolver,{ignoreImports=false}={}){
 text=text.replace(/\r\n?|\f/g,'\n').replace(/\0/g,'\ufffd');
 let result='',offset=0;for(const token of cssTokens(text)){if(token.imported){if(!ignoreImports)throw Error('CSS import requires preparation');result+=text.slice(offset,token.start);offset=token.end;continue;}result+=text.slice(offset,token.start)+'url('+JSON.stringify(resolver.url(token.value,path))+')';offset=token.end}return result+text.slice(offset);
}
// 原生层存档只投影实际CSS引用；不改注释、字符串或未匹配资源。
export function projectCasCssUrls(text,project){
 let result='',offset=0;for(const token of cssTokens(text)){const value=project(token.value);if(value===token.value)continue;result+=text.slice(offset,token.start)+(token.imported?'@import url('+JSON.stringify(value)+')'+(token.media?' '+token.media:'')+';':'url('+JSON.stringify(value)+')');offset=token.end}return result+text.slice(offset);
}
export async function rewriteCasCss(text,path,resolver,read,parents=new Set()){
 text=text.replace(/\r\n?|\f/g,'\n').replace(/\0/g,'\ufffd');
 if(parents.has(path))return '';if(parents.size>=32||text.length>8*1024**2)throw Error('CSS dependency limit');
 const chain=new Set([...parents,path]);let result='',offset=0;
 for(const token of cssTokens(text)){
  result+=text.slice(offset,token.start);offset=token.end;
  if(!token.imported){result+='url('+JSON.stringify(resolver.url(token.value,path))+')';continue}
  const next=resolver.row(token.value,path).path;let imported=chain.has(next)?'':await rewriteCasCss(await read(next),next,resolver,read,chain);
  // 登记入口仅使用 media imports；遇到 layer/supports 不得静默丢失语义。
  if(/^(?:layer|supports)\b/i.test(token.media))throw Error('Unsupported CSS import condition');
  if(token.media)imported='@media '+token.media+'{'+imported+'}';result+=imported;
 }
 return result+text.slice(offset);
}

// 保留每个 DOM Text 的规则归属；跨节点的单个 URL/import 只在其起始节点放置替换值。
function cssParts(parts){
 const normalized=parts.map((part,index)=>String(part).replace(index&&String(parts[index-1]).endsWith('\r')?/^\n/:/$^/,'').replace(/\r\n?|\f/g,'\n').replace(/\0/g,'\ufffd'));
 const bounds=[0];for(const part of normalized)bounds.push(bounds.at(-1)+part.length);
 const text=normalized.join(''),tokens=cssTokens(text);
 function apply(values){
  const output=normalized.map(()=>''),copy=(start,end)=>{for(let i=0;i<output.length;i++)if(start<bounds[i+1]&&end>bounds[i])output[i]+=text.slice(Math.max(start,bounds[i]),Math.min(end,bounds[i+1]));};let offset=0;
  tokens.forEach((token,index)=>{copy(offset,token.start);if(text.slice(token.start,token.end)===values[index]){copy(token.start,token.end);offset=token.end;return;}const owner=normalized.findIndex((_,i)=>token.start<bounds[i+1]);output[owner]+=values[index];offset=token.end;});copy(offset,text.length);return output;
 }
 return {text,tokens,apply};
}
export function rewriteCasCssParts(parts,path,resolver){
 const source=cssParts(parts);return source.apply(source.tokens.map(token=>{if(token.imported)throw Error('CSS import requires preparation');return 'url('+JSON.stringify(resolver.url(token.value,path))+')';}));
}
export async function rewriteCasCssPartsAsync(parts,path,resolver,read){
 const source=cssParts(parts),values=[];for(const token of source.tokens)values.push(await rewriteCasCss(source.text.slice(token.start,token.end),path,resolver,read));return source.apply(values);
}

// 只预热已审计版本中浏览器原本先选用的TTF，不改src顺序、字体或CSS正文。
export async function prepareAuditedCssFonts(text,path,resolver,actualSha,prepare,signal){
 const cssSha='b9a367e220f1136187f548f392455a74bd2b7a7bea78d8614e88780cba9f95ef',fontPath='data/others/这份恋情、予以保留、.ttf',fontSha='137729c9209fdf7ae9503f4407d7a0b95b872c67ee921ebc0ce4c4cba327bcce';
 if(typeof prepare!=='function'||resolver.manifest.pilot!=='tyrano-v49795-1'||path!=='tyrano/css/font.css'||actualSha!==cssSha||resolver.files.get(path)?.sha256!==cssSha||resolver.files.get(path)?.bytes!==1478)return [];
 const tokens=cssTokens(text);if(tokens.length!==3||tokens.some(t=>t.imported)||tokens[0].value!=='../../'+fontPath)return [];
 const row=resolver.row(tokens[0].value,path);if(row.sha256!==fontSha||row.bytes!==11728152||row.contentType!=='font/ttf')return [];
 signal?.throwIfAborted();await prepare(row.url,signal);signal?.throwIfAborted();return ['这份恋情、予以保留、'];
}

// 已核验冻结原包缺少这些jQuery UI纹理/图标；仅恢复原浏览器404后的显示效果。
export function applyCasCssCompatibility(text,path,resolver,actualSha){
 // 原生UTF8解析已证明这些face的所有候选均不可用；禁止转码或替换字体。
 const fontScopes=[
  {pilots:['tyrano-b315601-1','tyrano-v18636-1'],path:'tyrano/font.css',sha:'20fa3e8307a3ed04f0ae7fdd845c4c6f971f5d0ba85c02f4aefa51f6d34ba99f',bytes:440,faces:1,candidates:4},
  {pilots:['tyrano-v36554-1','tyrano-v36555-1'],path:'tyrano/font.css',sha:'d5ac434510c66ba950129d5dd0e4991c132e594cfad451dcd1445e3edf79c5e2',bytes:1800,faces:4,candidates:3},
  {pilots:['tyrano-v36556-1'],path:'tyrano/font.css',sha:'5eb8b81d8376de74c53f3a39983218c1a793773f1df85c0993f7108ddcfdafbc',bytes:3150,faces:7,candidates:3},
  {pilots:['tyrano-v36557-1','tyrano-v44249-1'],path:'tyrano/css/font.css',sha:'c3d124b364a4282e49f2d6183817dddfc6f782b6724912cf7834e8464fbcee8a',bytes:1389,faces:3,candidates:3},
 ];
 const scope=fontScopes.find(item=>item.pilots.includes(resolver.manifest.pilot)&&item.path===path&&item.sha===actualSha&&resolver.files.get(path)?.sha256===item.sha&&resolver.files.get(path)?.bytes===item.bytes);
 if(scope){
  const faces=[...text.matchAll(/@font-face\s*\{[^{}]*\}/g)],paths=[];
  if(faces.length!==scope.faces)return {text};
  for(const face of faces){const candidates=cssTokens(face[0]);if(candidates.length!==scope.candidates||candidates.some(token=>token.imported))return {text};
   for(const token of candidates){try{resolver.row(token.value,path);return {text};}catch(error){if(!error.message.startsWith('Unregistered resource: '))return {text};}paths.push(resolver.path(token.value,path));}
  }
  let result='',offset=0;for(const face of faces){result+=text.slice(offset,face.index);offset=face.index+face[0].length;}
  return {text:result+text.slice(offset),applied:{id:'tyrano-unavailable-native-font-faces',paths:[...new Set(paths)],source:path,sha256:scope.sha,tokens:paths.length,faces:faces.length}};
 }

 const sha='832bd58857e7687c61635c0a29aa28e05fdad430e56069952745fc5170a6501e';
 const pilots=['tyrano-b315601-1','tyrano-v18636-1','tyrano-v36554-1','tyrano-v36555-1','tyrano-v36556-1','tyrano-v36557-1','tyrano-v36558-1','tyrano-v49795-1'];
 const names=['animated-overlay.gif','ui-bg_highlight-soft_75_cccccc_1x100.png','ui-bg_glass_75_e6e6e6_1x400.png','ui-bg_glass_75_dadada_1x400.png','ui-bg_glass_65_ffffff_1x400.png','ui-bg_glass_55_fbf9ee_1x400.png','ui-bg_glass_95_fef1ec_1x400.png','ui-icons_888888_256x240.png','ui-icons_454545_256x240.png','ui-icons_2e83ff_256x240.png','ui-icons_cd0a0a_256x240.png','ui-bg_flat_0_aaaaaa_40x100.png'];
 if(!pilots.includes(resolver.manifest.pilot)||path!=='tyrano/libs/jquery-ui.css'||resolver.files.get(path)?.sha256!==sha||actualSha!==sha||names.some(name=>resolver.files.has('tyrano/libs/images/'+name)))return {text};
 const tokens=cssTokens(text).filter(token=>!token.imported&&names.some(name=>token.value==='images/'+name));
 if(tokens.length!==14||names.some(name=>tokens.filter(token=>token.value==='images/'+name).length!==(['ui-icons_454545_256x240.png','ui-bg_flat_0_aaaaaa_40x100.png'].includes(name)?2:1))||tokens.some(token=>text.slice(token.start,token.end)!==(token.value.endsWith('.gif')?'url("'+token.value+'")':'url('+token.value+')')))return {text};
 let result='',offset=0;for(const token of tokens){result+=text.slice(offset,token.start)+'none';offset=token.end;}
 return {text:result+text.slice(offset),applied:{id:'tyrano-missing-jquery-ui-images',paths:names.map(name=>'tyrano/libs/images/'+name),source:path,sha256:sha,tokens:tokens.length}};
}
