import fs from'node:fs';import{createHash}from'node:crypto';import assert from'node:assert/strict';
export const frameOf=page=>page.frames().find(f=>/\/__player\/resource\/[^/]+\/index\.html$/.test(f.url()));
// started 被父页确认后才发出阅读请求；存档回执会覆盖瞬时状态文案，因此不靠提示文字等待。
export function playerStartedRequest(page,entry,timeout=300000){
 const pending=page.waitForRequest(request=>{
  if(request.method()!=='POST'||new URL(request.url()).pathname!=='/api/public/works/'+entry.workId+'/read')return false;
  try{return request.postDataJSON().versionId===entry.versionId}catch{return false}
 },{timeout});pending.catch(()=>{});return pending;
}
export const describe=files=>files.map(f=>({path:f.path,mtime:f.mtime,bytes:f.data.length,sha256:createHash('sha256').update(Buffer.from(f.data)).digest('hex')})).sort((a,b)=>a.path.localeCompare(b.path));
export async function nativeFiles(page,entry){return frameOf(page).evaluate(async entry=>{
 if(entry.runtimeKind==='Tyrano'){const {storageSnapshot}=await import('/player/adapters.mjs');return storageSnapshot(localStorage).map(f=>({...f,data:Array.from(f.data)}))}
 const files=[],F=Module.FS??FS;function walk(dir,relative){for(const name of F.readdir(dir)){if(name==='.'||name==='..')continue;const full=dir+'/'+name,path=relative?relative+'/'+name:name,stat=F.lstat(full);if(F.isDir(stat.mode))walk(full,path);else{if(!F.isFile(stat.mode))throw Error('Unexpected native save node');files.push({path,data:Array.from(F.readFile(full)),mtime:Math.trunc(Number(stat.mtime))})}}}walk(entry.mount,'');if(entry.extraMount)walk(entry.extraMount,'game-saves');return files;
 },entry)}
export async function localHead(page,id){return page.evaluate(async id=>{const store=await(await import('/ons/storage.mjs')).openSaveStore();try{const head=await store.get(id);return head?{...head,snapshot:{...head.snapshot,files:head.snapshot.files.map(f=>({...f,data:Array.from(f.data)}))},history:await store.history(id)}:null}finally{store.close()}},id)}
export async function stop(page){await page.getByRole('button',{name:'保存并退出',exact:true}).click();await page.getByRole('button',{name:/^(开始阅读|继续阅读)$/}).waitFor({timeout:35000});assert.equal(await page.locator('iframe[sandbox="allow-scripts"][src^="/__"]').count(),0)}
export async function captureFiles(page,entry,file){const rows=await nativeFiles(page,entry);fs.writeFileSync(file,JSON.stringify(rows));return describe(rows)}
export async function writeBackup(page,entry,file,files){const value=await page.evaluate(async({id,files})=>{const {exportBackup}=await import('/ons/storage.mjs');return exportBackup({schema:1,pilot:id,files:files.map(f=>({...f,data:new Uint8Array(f.data)}))})},{id:entry.id,files});fs.writeFileSync(file,value)}
