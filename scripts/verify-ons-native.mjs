import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const origin = process.env.WG_ONS_TEST_URL || "http://127.0.0.1:18481";
const pilots = [{ id: "clannad", path: "/4/1/", old: "/onsyuri_save/clannad", start: [.78,.45], load: [.78,.525], menuSave: [.69,.356], slot1: [.25,.337], slot2: [.25,.4] }, { id: "saya", path: "/97/1/", old: "/onsyuri_save/沙耶之歌", start: [.78,.23], load: [.78,.38], menuSave: [.38,.395], slot1: [.5,.315], slot2: [.5,.369] }];
mkdirSync("reports/ons-pilot", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.WG_CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader"] });
const results = [], errors = [];
const frameOf = p => p.frames().find(f => f.url().includes("/__ons/runtime/"));
const hash = bytes => createHash("sha256").update(Buffer.from(bytes)).digest("hex");
const describe = rows => rows.map(f => ({ path:f.path,bytes:f.data.length,mtime:f.mtime,sha256:hash(f.data) })).sort((a,b)=>a.path.localeCompare(b.path));
async function pageFor(context, pilot) {
  const p=await context.newPage(); p.on("dialog", d=>d.accept());
  p.on("pageerror", e=>errors.push({pilot:pilot.id,error:e.message}));
  await p.goto(origin+pilot.path,{waitUntil:"networkidle"});
  await p.getByRole("button",{name:"开始阅读",exact:true}).waitFor();return p;
}
async function tap(p, point, delay=1400) {
  const c=frameOf(p).locator("#canvas"),b=await c.boundingBox();
  await c.hover({position:{x:5,y:5}});await p.waitForTimeout(100);
  await c.hover({position:{x:b.width*point[0],y:b.height*point[1]}});await p.waitForTimeout(150);
  await c.click({position:{x:b.width*point[0],y:b.height*point[1]},delay:150});await p.waitForTimeout(delay);
}
async function start(p,pilot) {
  await p.getByRole("button",{name:"开始阅读",exact:true}).click();
  await p.getByRole("status").filter({hasText:"引擎已启动"}).waitFor({timeout:60000});
  // The CLANNAD package deliberately displays a 30-second initial notice.
  await p.waitForTimeout(pilot.id==="clannad"?35000:12000);
}
async function stop(p) {
  await p.getByRole("button",{name:"结束阅读并保留存档",exact:true}).click();
  await p.getByRole("button",{name:"开始阅读",exact:true}).waitFor();
  assert.equal(await p.locator("iframe").count(),0);
}
async function fsRows(p) {
  return frameOf(p).evaluate(()=>{const F=g_onsyuri_module.FS, rows=[];function walk(dir,base){for(const n of F.readdir(dir)){if(n==='.'||n==='..')continue;const full=dir+'/'+n,path=base?base+'/'+n:n,stat=F.lstat(full);if(F.isDir(stat.mode))walk(full,path);else{if(!F.isFile(stat.mode))throw Error('Unexpected save link');rows.push({path,data:Array.from(F.readFile(full)),mtime:Number(stat.mtime)})}}}walk('/save','');return rows});
}
async function headRows(p,id) {
  return p.evaluate(async id=>{const s=await(await import('/ons/storage.mjs')).openSaveStore();try{const h=await s.get(id);return h.snapshot.files.map(f=>({...f,data:Array.from(f.data)}))}finally{s.close()}},id);
}
async function beginNewGame(p,pilot) {
  // Wait on the known opening scene, rather than assuming the title animation
  // finished when WASM initialization returned or after a fixed delay.
  let entered=false;
  for(let attempt=0;attempt<12;attempt++) {
    await tap(p,pilot.start,3000);
    const png=await frameOf(p).locator('#canvas').screenshot();
    entered=await frameOf(p).evaluate(async({id,png})=>{
      const bitmap=await createImageBitmap(new Blob([new Uint8Array(png)],{type:'image/png'}));
      const c=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
      const d=ctx.getImageData(0,0,c.width,Math.floor(c.height*.65)).data;
      let matches=0,total=0;
      for(let i=0;i<d.length;i+=128){total++;const r=d[i],g=d[i+1],b=d[i+2];if(id==='clannad'?(r>245&&g>245&&b>245):(r>40&&r>g*1.2&&r>b*1.2))matches++;}
      return matches/total>(id==='clannad'?.95:.4);
    },{id:pilot.id,png:Array.from(png)});
    if(entered)break;
  }
  assert(entered,'native new-game opening scene visible');await p.waitForTimeout(5000);
}
async function saveSlot(p,pilot,slot) {
  await p.getByRole("button",{name:"游戏菜单",exact:true}).click();await p.waitForTimeout(3500);
  await tap(p,pilot.menuSave);await tap(p,slot);
  if(pilot.id==="saya")await tap(p,[.4,.555]);
}
async function shot(p,name){await frameOf(p).locator('#canvas').screenshot({path:'reports/ons-pilot/'+name+'.jpg',type:'jpeg',quality:55})}
try {
  let fixtures={};
  if(process.argv.includes('--reuse-fixtures')) fixtures=JSON.parse(readFileSync('reports/ons-pilot/native-save-fixtures.json','utf8'));
  else {
    const capture=await browser.newContext({viewport:{width:1280,height:960}});
    for(const pilot of pilots){
      const p=await pageFor(capture,pilot);await start(p,pilot);await beginNewGame(p,pilot);
      await saveSlot(p,pilot,pilot.slot1);fixtures[pilot.id]=await fsRows(p);
      assert(fixtures[pilot.id].some(f=>f.path==='save1.dat'),'actual native save slot exists');
      assert(fixtures[pilot.id].some(f=>f.path==='envdata'),'settings are included in save namespace');
      await stop(p);assert.deepEqual(describe(await headRows(p,pilot.id)),describe(fixtures[pilot.id]));
      await p.close();console.log('NATIVE_CAPTURE '+pilot.id);
    }
    await capture.close();writeFileSync('reports/ons-pilot/native-save-fixtures.json',JSON.stringify(fixtures));
  }
  const context=await browser.newContext({viewport:{width:1280,height:960}});
  for(const pilot of pilots){
    const p=await pageFor(context,pilot), original=fixtures[pilot.id];
    // Only this isolated QA context is seeded. Never touch a user's legacy DB.
    await p.evaluate(async ({pilot,rows})=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(pilot.old,21);r.onupgradeneeded=()=>r.result.createObjectStore('FILE_DATA');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});await new Promise((resolve,reject)=>{const t=db.transaction('FILE_DATA','readwrite');for(const f of rows)t.objectStore('FILE_DATA').put({timestamp:new Date(f.mtime),mode:33206,contents:new Uint8Array(f.data)},pilot.old+'/'+f.path);t.oncomplete=resolve;t.onabort=()=>reject(t.error)});db.close()}, {pilot,rows:original});
    const download=p.waitForEvent('download');await p.getByRole('button',{name:'备份并读取本来源旧档',exact:true}).click();
    await(await download).saveAs('reports/ons-pilot/'+pilot.id+'-legacy-original.json');
    await p.getByRole('status').filter({hasText:'下次启动将从此存档读取'}).waitFor();
    assert.deepEqual(describe(await headRows(p,pilot.id)),describe(original));
    const migration=await p.evaluate(async id=>{const s=await(await import('/ons/storage.mjs')).openSaveStore();try{return(await s.history(id)).find(h=>h.reason==='legacy-import').id}finally{s.close()}},pilot.id);
    await start(p,pilot);
    const restored=await fsRows(p);
    for(const f of original){const value=restored.find(r=>r.path===f.path);assert(value,'restored '+f.path);assert.equal(hash(value.data),hash(f.data));if(f.path.toLowerCase()!=='envdata')assert.equal(value.mtime,f.mtime,'native slot original date');}
    const settingsLink=await frameOf(p).evaluate(()=>g_onsyuri_module.FS.readlink('/game/envdata'));
    assert.equal(settingsLink,'/save/envdata');
    await tap(p,pilot.load);await tap(p,pilot.slot1);if(pilot.id==='saya')await tap(p,[.4,.555]);
    await p.waitForTimeout(2000);await shot(p,pilot.id+'-native-loaded');console.log('NATIVE_LOAD_SCREEN '+pilot.id);
    await tap(p,[.5,.75],1800);await saveSlot(p,pilot,pilot.slot2);
    const progressed=await fsRows(p);assert(progressed.some(f=>f.path==='save2.dat'),'native re-save after loading');
    assert(progressed.some(f=>f.path==='envdata'),'settings captured');await shot(p,pilot.id+'-native-resaved');
    await stop(p);assert.deepEqual(describe(await headRows(p,pilot.id)),describe(progressed));
    const backup=p.waitForEvent('download');await p.getByRole('button',{name:'导出当前存档',exact:true}).click();
    const backupPath='reports/ons-pilot/'+pilot.id+'-portable.json';await(await backup).saveAs(backupPath);
    await p.locator('#ons-history').selectOption(migration);await p.getByRole('button',{name:'下次启动使用此备份',exact:true}).click();
    await p.getByRole('status').filter({hasText:'下次启动将从此存档读取'}).waitFor();
    assert.deepEqual(describe(await headRows(p,pilot.id)),describe(original));
    await p.getByLabel('导入存档备份',{exact:true}).setInputFiles(backupPath);
    await p.waitForFunction(async({id,n})=>{const s=await(await import('/ons/storage.mjs')).openSaveStore();try{return(await s.get(id)).snapshot.files.length===n}finally{s.close()}},{id:pilot.id,n:progressed.length},{timeout:15000});
    assert.deepEqual(describe(await headRows(p,pilot.id)),describe(progressed));await p.reload();
    await p.getByRole('button',{name:'开始阅读',exact:true}).waitFor();assert.deepEqual(describe(await headRows(p,pilot.id)),describe(progressed));
    const legacyAfter=await p.evaluate(async id=>{const v=await(await import('/ons/storage.mjs')).readLegacy(id);return v.files.map(f=>({...f,data:Array.from(f.data)}))},pilot.id);
    assert.deepEqual(describe(legacyAfter),describe(original),'legacy bytes and dates untouched');
    const history=await p.evaluate(async({id,key})=>{const s=await(await import('/ons/storage.mjs')).openSaveStore();try{return{rows:(await s.history(id)).length,original:(await s.getRevision(key,id)).snapshot.files.map(f=>({...f,data:Array.from(f.data)}))}}finally{s.close()}},{id:pilot.id,key:migration});
    assert(history.rows>=3);assert.deepEqual(describe(history.original),describe(original));
    results.push({pilot:pilot.id,status:'passed',nativeSaved:describe(original),nativeLoadedAndResaved:describe(progressed),immutableHistory:history.rows,legacyUnchanged:true,settingsLink});
    await p.close();console.log('NATIVE_RESTORE '+pilot.id);
  }
  await context.close();assert.equal(errors.length,0,JSON.stringify(errors));
  writeFileSync('reports/ons-pilot/native.json',JSON.stringify({status:'passed',results,errors},null,2));console.log(JSON.stringify({status:'passed',results}));
} catch(e){writeFileSync('reports/ons-pilot/native.json',JSON.stringify({status:'failed',error:e.message,results,errors},null,2));for(const p of browser.contexts().flatMap(c=>c.pages())){if(frameOf(p))await shot(p,'native-failure').catch(()=>{})}throw e}
finally{await browser.close()}
