export const casOrigin='https://wg-b2.saop.cc';
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
export async function readCasManifest(response,entry,options){
 if(!response.ok)throw Error('资源清单不可用');
 const limit=32*1024**2;if(Number(response.headers.get('content-length'))>limit)throw Error('资源清单过大');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('资源清单过大')}chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength}
 const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));createCasResolver(manifest,entry,options);return manifest;
}
const unescapeCss=value=>value.replace(/\\(?:([a-f\d]{1,6})\s?|([^\r\n\f])|\r?\n)/gi,(_,hex,char)=>hex?String.fromCodePoint(parseInt(hex,16)||0xfffd):char??'');
function stringEnd(text,start){const quote=text[start];let i=start+1;for(;i<text.length;i++){if(text[i]==='\\'){i++;continue}if(text[i]===quote)return i+1}throw Error('Unterminated CSS string')}
function cssTokens(text){
 const tokens=[];let i=0;
 const space=()=>{for(;;){while(/\s/.test(text[i]??'')&&i<text.length)i++;if(text.slice(i,i+2)!=='/*')break;const end=text.indexOf('*/',i+2);if(end<0)throw Error('Unterminated CSS comment');i=end+2}};
 function value(){space();if(text[i]==='"'||text[i]==="'"){const start=i;i=stringEnd(text,i);return unescapeCss(text.slice(start+1,i-1));}const start=i;for(;i<text.length&&text[i]!==')';i++)if(text[i]==='\\')i++;return unescapeCss(text.slice(start,i).trim());}
 while(i<text.length){
  if(text.slice(i,i+2)==='/*'){const end=text.indexOf('*/',i+2);if(end<0)throw Error('Unterminated CSS comment');i=end+2;continue}
  if(text[i]==='"'||text[i]==="'"){i=stringEnd(text,i);continue}
  const start=i,imported=/^@import\b/i.exec(text.slice(i)),url=/^url\s*\(/i.exec(text.slice(i));
  if(imported){i+=imported[0].length;space();let name;
   const fn=/^url\s*\(/i.exec(text.slice(i));if(fn){i+=fn[0].length;name=value();space();if(text[i++]!==')')throw Error('Invalid CSS URL')}else if(text[i]==='"'||text[i]==="'")name=value();else throw Error('Invalid CSS import');
   const mediaStart=i;let depth=0;for(;i<text.length;i++){if(text[i]==='"'||text[i]==="'"){i=stringEnd(text,i)-1;continue}if(text[i]==='(')depth++;if(text[i]===')')depth--;if(text[i]===';'&&!depth)break}if(i===text.length)throw Error('Unterminated CSS import');
   tokens.push({start,end:++i,value:name,media:text.slice(mediaStart,i-1).trim(),imported:true});continue;
  }
  if(url){i+=url[0].length;const name=value();space();if(text[i++]!==')')throw Error('Invalid CSS URL');tokens.push({start,end:i,value:name});continue}
  i++;
 }
 return tokens;
}
export function rewriteCasCssUrls(text,path,resolver){
 let result='',offset=0;for(const token of cssTokens(text)){if(token.imported)throw Error('CSS import requires preparation');result+=text.slice(offset,token.start)+'url('+JSON.stringify(resolver.url(token.value,path))+')';offset=token.end}return result+text.slice(offset);
}
export async function rewriteCasCss(text,path,resolver,read,parents=new Set()){
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
