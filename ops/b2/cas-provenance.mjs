import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import assets from './public-assets.mjs';

// 验收独立消费冻结的公开资源控制表，不请求在线映射，也不导入 Worker 推导函数。
const release='releases/20261027-01/';
const ons='64ed1e7b9e92aa83b8106227d6095b3ab951e2bed75ac4bb8ed43f044737de04';
const shared='renpy-5b572ebfa6248cac249cab61f698c967cac82b7d225da7515971b383d0f0a3cf';
export function expectedOriginalKey(requestURL){
 const url=new URL(requestURL);assert.equal(url.origin,'https://wg-b2.saop.cc','Unexpected resource origin');assert(!url.username&&!url.password,'Unexpected URL credentials');
 const pathname=url.pathname.replace(/^\/__cas-canary(?=\/)/,'');
 const decoded=decodeURIComponent(pathname.slice(1));
 assert(!/[\\\u0000-\u001f\u007f]/.test(decoded)&&decoded.split('/').every(part=>part&&part!=='.'&&part!=='..'),'Unsafe resource path');
 if(decoded.startsWith('releases/')){assert(decoded.startsWith(release)&&decoded.length>release.length,'Unexpected release');return decoded;}
 const parts=decoded.split('/');
 if(parts[0]==='__player'&&parts[1]==='resource'||parts[0]==='__ons'&&parts[1]==='data'){
  const id=parts[2],file=parts.slice(3).join('/');assert(Object.hasOwn(assets.games,id??'')&&file,'Unknown game or missing file');
  const alias=id+'\0'+file.toLowerCase();return release+(Object.hasOwn(assets.media,alias)?'media/'+assets.media[alias]:'games/'+assets.games[id]+'/'+file);
 }
 if(parts[0]==='__ons'&&parts[1]==='engine'){assert(parts.length===4&&parts[2]===ons&&['onsyuri.js','onsyuri.wasm'].includes(parts[3]),'Unknown ONS engine');return release+'games/clannad/'+parts[3];}
 if(parts[0]==='__engines'&&parts[1]==='resource'){assert(parts.length===4&&parts[2]===shared&&['renpy.js','renpy-pre.js','renpy.wasm','renpy.data'].includes(parts[3]),'Unknown shared engine');return release+'engines/'+shared+'/'+parts[3];}
 throw Error('Unregistered resource URL');
}
export function validateCasSources(sources){
 assert(Array.isArray(sources)&&sources.length>0,'No actual B2 resource responses');
 for(const row of sources){assert.equal(row.source,'b2','Resource source must be B2');assert.match(row.key??'',/^[a-f0-9]{64}\.bin$/,'Invalid CAS physical key');assert.equal(row.sha256,row.key.slice(0,64),'SHA-256 must match physical key');assert(['HIT','MISS'].includes(row.cache),'Missing cache provenance');assert.equal(row.originalKey,expectedOriginalKey(row.url),'Original key must exactly match requested frozen resource');}
 return {status:'passed',sources:sources.length};
}
// 可对既有完整浏览器记录离线补验；不把补验误写成旧进程已执行新版断言。
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert(process.argv.length>2,'Pass one or more recorded browser JSON files');
 for(const file of process.argv.slice(2)){const document=JSON.parse(fs.readFileSync(file,'utf8')),records=Array.isArray(document)?document:[document];for(const record of records)console.log(JSON.stringify({file,id:record.id,...validateCasSources(record.sources)}));}
}
