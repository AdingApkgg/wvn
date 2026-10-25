import { validateSnapshot, snapshotDigest, limits } from './protocol.mjs';
const META='wg-ons-manifest.json', PART=32*1024**2, MAX_META=262144;
export const sha256=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
function identity(value,target){
  if(value.format!=='wg-ons-cloud'||value.schema!==1||value.pilot!==target.id||value.versionId!==target.versionId||value.engine!==target.engine)throw Error('云端备份不属于此游戏版本或引擎；本机存档未修改');
}
export async function packSnapshot(input,target){
  const snapshot=validateSnapshot(input,target.id);
  if(!snapshot.files.length)throw Error('没有可上传的游戏存档');
  const chunks=[],files=[];let offset=0;
  for(const f of snapshot.files){files.push({path:f.path,offset,bytes:f.data.length,...(f.mtime===undefined?{}:{mtime:f.mtime})});chunks.push(f.data);offset+=f.data.length;}
  const all=new Blob(chunks),parts=[];
  for(let at=0;at<Math.max(1,all.size);at+=PART){const blob=all.slice(at,at+PART);parts.push({name:`wg-ons-data-${parts.length}.bin`,bytes:blob.size,sha256:await sha256(await blob.arrayBuffer()),blob});}
  const digest=await snapshotDigest(snapshot);
  const metadata=new Blob([JSON.stringify({format:'wg-ons-cloud',schema:1,pilot:target.id,versionId:target.versionId,engine:target.engine,digest,files,parts:parts.map(({blob,...part})=>part)})],{type:'application/json'});
  if(metadata.size>MAX_META||metadata.size+all.size>limits.totalBytes)throw Error('云端备份含校验信息后超过 64 MiB；本机存档仍保留，请先导出');
  return {digest,files:[{name:META,bytes:metadata.size,sha256:await sha256(await metadata.arrayBuffer()),blob:metadata},...parts]};
}
export async function unpackSnapshot(input,target){
  if(!Array.isArray(input)||input.length<2||input.length>3||input.some(f=>!(f.blob instanceof Blob)||f.blob.size>PART)||input.reduce((n,f)=>n+f.blob.size,0)>limits.totalBytes)throw Error('云端备份大小或文件数量无效');
  const meta=input.find(f=>f.name===META);
  if(!meta||meta.blob.size>MAX_META||new Set(input.map(f=>f.name)).size!==input.length)throw Error('此备份不是统一播放器格式，可在账号页单独下载原文件');
  const value=JSON.parse(await meta.blob.text());identity(value,target);
  if(!Array.isArray(value.parts)||value.parts.length!==input.length-1||!Array.isArray(value.files)||value.files.length<1||value.files.length>512)throw Error('云端备份清单无效');
  const chunks=[];
  for(const [i,part] of value.parts.entries()){
    const file=input.find(f=>f.name===`wg-ons-data-${i}.bin`);
    if(!file||part.name!==file.name||part.bytes!==file.blob.size||await sha256(await file.blob.arrayBuffer())!==part.sha256)throw Error('云端备份文件校验失败；本机存档未修改');
    chunks.push(file.blob);
  }
  const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let offset=0;
  const files=value.files.map(f=>{
    if(!Number.isSafeInteger(f.bytes)||f.bytes<0||f.offset!==offset||offset+f.bytes>bytes.length)throw Error('云端备份文件边界无效');
    const data=bytes.slice(offset,offset+f.bytes);offset+=f.bytes;
    return {path:f.path,data,...(f.mtime===undefined?{}:{mtime:f.mtime})};
  });
  if(offset!==bytes.length)throw Error('云端备份包含未声明的数据');
  const snapshot=validateSnapshot({schema:1,pilot:target.id,files},target.id);
  if(await snapshotDigest(snapshot)!==value.digest)throw Error('云端备份摘要校验失败；本机存档未修改');
  return snapshot;
}

// Account-owned transport state is separate from anonymous/legacy game history.
// Every transaction resolves only after oncomplete, including retry envelopes.
async function transaction(stores,mode,operation){
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('wg-ons-cloud-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('links',{keyPath:'key'});r.result.createObjectStore('drafts',{keyPath:'captureId'}).createIndex('owner','owner')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('请关闭旧云存档页面后重试'))});
  db.onversionchange=()=>db.close();
  return new Promise((resolve,reject)=>{const t=db.transaction(stores,mode,{durability:'strict'});let result;const set=v=>result=v;try{operation(t,set)}catch(e){t.abort();db.close();reject(e);return}t.oncomplete=()=>{db.close();resolve(result)};t.onabort=()=>{db.close();reject(t.error??Error('云存档本机队列未能保存，原存档保留'))};t.onerror=()=>{}});
}
const key=(owner,version)=>JSON.stringify([owner,version]);
export const cloudState={
  link:(owner,version)=>transaction(['links'],'readonly',(t,set)=>{const r=t.objectStore('links').get(key(owner,version));r.onsuccess=()=>set(r.result??null)}),
  drafts:owner=>transaction(['drafts'],'readonly',(t,set)=>{const r=t.objectStore('drafts').index('owner').getAll(owner);r.onsuccess=()=>set(r.result)}),
  enqueue:draft=>transaction(['drafts'],'readwrite',t=>{t.objectStore('drafts').add(draft)}),
  discard:captureId=>transaction(['drafts'],'readwrite',t=>{t.objectStore('drafts').delete(captureId)}),
  acknowledge:(draft,head,conflict)=>transaction(['drafts','links'],'readwrite',t=>{
    if(!conflict)t.objectStore('links').put({key:key(draft.owner,draft.version),profile:draft.profile,generation:draft.generation,head});
    t.objectStore('drafts').delete(draft.captureId);
  }),
  applied:(owner,version,profile)=>transaction(['links'],'readwrite',t=>{t.objectStore('links').put({key:key(owner,version),profile:profile.id,generation:profile.generation,head:profile.head})}),
};
