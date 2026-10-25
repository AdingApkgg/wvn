import { limits, validateSnapshot, snapshotDigest } from "./protocol.mjs";
import { players as pilots, findPlayer } from "../player/registry.mjs";
import { createMemoryStorage, storageSnapshot, belongsToLegacyScope } from "../player/adapters.mjs";
const legacyNames = Object.freeze(Object.fromEntries(pilots.map(p => [p.id, p.legacySave])));
const budget = 512 * 1024 * 1024;
function scope(pilot) { if (!Object.hasOwn(legacyNames, pilot)) throw Error("未知存档版本"); return pilot; }
export async function openSaveStore(database = "wg-ons-pilot-v1") {
  if(database!=="wg-ons-pilot-v1"&&!/^wvn-engine-candidates-v1-ons-[a-f0-9]{64}$/.test(database))throw Error("未知引擎工作区");
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open(database, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("heads", { keyPath: "pilot" });
      r.result.createObjectStore("snapshots", { keyPath: "id" }).createIndex("pilot", "pilot");
    };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    r.onblocked = () => reject(Error("存档数据库被其他页面占用，请关闭旧页面后重试"));
  });
  db.onversionchange = () => db.close();
  function read(store, key) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, "readonly"), r = t.objectStore(store).get(key);
      r.onsuccess = () => resolve(r.result ?? null); r.onerror = () => reject(r.error);
    });
  }
  return {
    close() { db.close(); },
    async get(pilot) { return read("heads", scope(pilot)); },
    async getRevision(id, pilot) {
      scope(pilot);
      const row = await read("snapshots", id);
      if (!row || row.pilot !== pilot) throw Error("存档历史不属于当前版本");
      return row;
    },
    async history(pilot) {
      scope(pilot);
      return new Promise((resolve, reject) => {
        const rows = [], t = db.transaction("snapshots", "readonly");
        const r = t.objectStore("snapshots").index("pilot").openCursor(IDBKeyRange.only(pilot));
        r.onsuccess = () => {
          const cursor = r.result;
          if (!cursor) return;
          const { id, pilot, revision, digest, reason, createdAt, bytes } = cursor.value;
          rows.push({ id, pilot, revision, digest, reason, createdAt, bytes }); cursor.continue();
        };
        t.oncomplete = () => resolve(rows.sort((a, b) => b.revision - a.revision));
        t.onabort = () => reject(t.error);
      });
    },
    async commit(pilot, base, input, reason = "engine", check = () => {}) {
      scope(pilot);
      if (!Number.isSafeInteger(base) || base < 0 || !["engine", "legacy-import", "file-import", "restore"].includes(reason)) throw Error("无效存档事务");
      const snapshot = validateSnapshot(input, pilot), digest = await snapshotDigest(snapshot);
      check();
      const bytes = snapshot.files.reduce((n, f) => n + f.data.byteLength, 0);
      return new Promise((resolve, reject) => {
        const t = db.transaction(["heads", "snapshots"], "readwrite", { durability: "strict" });
        let result, failure;
        const fail = message => { failure = Error(message); t.abort(); };
        const heads = t.objectStore("heads"), r = heads.get(pilot);
        r.onsuccess = () => {
          try { check(); } catch { return fail('账号状态已变化；原本机存档未修改'); }
          const current = r.result;
          if ((current?.revision ?? 0) !== base) return fail("另一个页面已保存新进度；本页暂停保存，请先导出本页存档再重新载入");
          if (current?.digest === digest) { result = current; return; }
          if (reason === "engine" && current?.snapshot.files.length && !snapshot.files.length) return fail("拒绝用空存档覆盖已有进度");
          if ((current?.bytesHeld ?? 0) + bytes > budget) return fail("本机历史备份已达 512 MiB；请先导出备份，当前进度未覆盖");
          result = { id: crypto.randomUUID(), pilot, revision: base + 1, digest, snapshot, reason, bytes, bytesHeld: (current?.bytesHeld ?? 0) + bytes, createdAt: new Date().toISOString() };
          t.objectStore("snapshots").add(result);
          heads.put(result);
        };
        t.oncomplete = () => resolve(result);
        t.onabort = () => reject(failure ?? t.error ?? Error("本机保存失败；请立即导出存档备份"));
        t.onerror = () => { /* onabort is the single failure acknowledgement */ };
      });
    },
  };
}

export async function readLegacy(pilot) {
  scope(pilot);
  if (findPlayer(pilot).runtimeKind!=='Tyrano' && typeof indexedDB.databases !== "function") throw Error("当前浏览器不能安全探测旧存档库，请使用已导出的备份文件");
  const entry=findPlayer(pilot);
  if(entry.runtimeKind==='Tyrano'){
    const storage=createMemoryStorage();
    for(const key of entry.legacyKeys){const value=localStorage.getItem(key);if(value!==null)storage.setItem(key,value)}
    return validateSnapshot({schema:1,pilot,files:storageSnapshot(storage,0)},pilot);
  }
  if(entry.runtimeKind==='RenPy')belongsToLegacyScope(entry,'');
  const sources=[{name:legacyNames[pilot],prefix:'',primary:true},...(entry.extraMount?[{name:entry.extraMount,prefix:'game-saves/',primary:false}]:[])];
  const databases=await indexedDB.databases(),files=[];let total=0,found=false;
  for(const source of sources){
    if(!databases.some(d=>d.name===source.name))continue;found=true;
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open(source.name);
      request.onupgradeneeded=()=>request.transaction.abort();
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    try{
      if(!db.objectStoreNames.contains('FILE_DATA'))throw Error('旧存档格式无法识别，原库未修改');
      await new Promise((resolve,reject)=>{
        const transaction=db.transaction('FILE_DATA','readonly'),request=transaction.objectStore('FILE_DATA').openCursor();let failure;
        request.onsuccess=()=>{
          const cursor=request.result;if(!cursor)return;const key=cursor.key,row=cursor.value;
          if(typeof key==='string'&&key.startsWith(source.name+'/')){
            const relative=key.slice(source.name.length+1),mode=row.mode&0xf000;
            if(mode!==0x4000&&(!source.primary||belongsToLegacyScope(entry,relative))){
              if(mode!==0x8000||!(row.contents instanceof Uint8Array)){failure=Error('旧存档包含无法识别的文件，原库未修改');transaction.abort();return}
              total+=row.contents.byteLength;
              if(files.length>=limits.files||total>limits.totalBytes||row.contents.byteLength>limits.fileBytes){failure=Error('旧存档超出迁移大小限制，原库未修改');transaction.abort();return}
              files.push({path:source.prefix+relative,data:new Uint8Array(row.contents),...(row.timestamp===undefined?{}:{mtime:Math.trunc(Number(row.timestamp))})});
            }
          }
          cursor.continue();
        };
        transaction.oncomplete=()=>resolve();transaction.onabort=()=>reject(failure??transaction.error);
      });
    }finally{db.close()}
  }
  return found?validateSnapshot({schema:1,pilot,files},pilot):null;
}

export async function exportBackup(input, releaseId) {
  if(releaseId!==undefined&&!/^ons-[a-f0-9]{64}$/.test(releaseId))throw Error("未知引擎版本");
  const s = validateSnapshot(input, input?.pilot);
  const files = s.files.map(f => {
    let binary = "";
    for (let offset = 0; offset < f.data.length; offset += 32768) binary += String.fromCharCode(...f.data.subarray(offset, offset + 32768));
    return { path: f.path, data: btoa(binary), ...(f.mtime === undefined ? {} : { mtime: f.mtime }) };
  });
  return JSON.stringify({ format: releaseId ? "wvn-engine-save" : "wg-ons-save", schema: releaseId ? 2 : 1, ...(releaseId?{releaseId}:{}), pilot: s.pilot, digest: await snapshotDigest(s), files });
}
export async function importBackup(text, pilot, candidate) {
  scope(pilot);
  if (typeof text !== "string" || text.length > 90 * 1024 * 1024) throw Error("备份文件过大");
  const value = JSON.parse(text);
  const legacy=value.format==="wg-ons-save"&&value.schema===1;
  if(candidate){
    if(!/^ons-[a-f0-9]{64}$/.test(candidate.releaseId))throw Error("未知引擎版本");
    if(legacy&&!candidate.allowLegacyCopy)throw Error("旧引擎备份需要明确复制到独立候选工作区");
    if(!legacy&&(value.format!=="wvn-engine-save"||value.schema!==2||value.releaseId!==candidate.releaseId))throw Error("备份不属于当前引擎版本");
  }else if(!legacy)throw Error("备份不属于当前引擎版本");
  if(value.pilot!==pilot||!Array.isArray(value.files)||value.files.length>limits.files)throw Error("备份不属于当前游戏版本");
  let total = 0;
  const files = value.files.map(f => {
    if (typeof f.data !== "string" || f.data.length > Math.ceil(limits.fileBytes / 3) * 4 || f.data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(f.data)) throw Error("备份内容无效");
    const binary = atob(f.data);
    if (btoa(binary) !== f.data) throw Error("备份编码无效");
    total += binary.length;
    if (total > limits.totalBytes) throw Error("备份超过 64 MiB");
    return { path: f.path, data: Uint8Array.from(binary, c => c.charCodeAt(0)), ...(f.mtime === undefined ? {} : { mtime: f.mtime }) };
  });
  const snapshot = validateSnapshot({ schema: 1, pilot, files }, pilot);
  if (await snapshotDigest(snapshot) !== value.digest) throw Error("备份校验失败；原存档未修改");
  return snapshot;
}
