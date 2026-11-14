// 专用构建机执行；只读网络请求，存档验收仅使用临时浏览器上下文的本机副本。
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const origin=process.env.WVN_ONS_VERIFY_ORIGIN,revision=process.env.WVN_ONS_VERIFY_REVISION,out=process.env.WVN_ONS_VERIFY_OUTPUT;
if(!origin||new URL(origin).origin!==origin||!origin.startsWith('https:')||!revision||!out)throw Error('Set WVN_ONS_VERIFY_ORIGIN, WVN_ONS_VERIFY_REVISION and WVN_ONS_VERIFY_OUTPUT');
mkdirSync(out,{recursive:true});
const pixelCode="from PIL import Image;import sys,json,hashlib;im=Image.open(sys.argv[1]).convert('RGB').resize((80,60));p=list(im.getdata());print(json.dumps({'nonBlack':sum(max(v)>25 for v in p)/len(p),'signature':hashlib.sha256(im.tobytes()).hexdigest()}))";
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],proxy:{server:process.env.HTTPS_PROXY}}),records=[];
try{for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[],runtimeBodies=[],runtimeHeaders=[];
 page.on('pageerror',error=>errors.push({message:error.message,stack:error.stack}));
 await context.addInitScript(()=>{if(window===top)localStorage.setItem('wvn-whole-resource-mode','demand')});
 await context.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
 try{
  const response=await context.request.get(origin+'/health');assert.equal((await response.json()).revision,revision);
  page.on('response',response=>{if(new URL(response.url()).pathname==='/__ons/runtime/clannad'){runtimeHeaders.push(response.headers());const task=response.text().then(body=>{assert(!body.includes('window.__CF$cv$params')&&!body.includes('/cdn-cgi/challenge-platform/'),'Cloudflare JSD must not enter the opaque runtime')});task.catch(()=>{});runtimeBodies.push(task)}});
  await page.goto(origin+'/4/1/',{waitUntil:'networkidle'});await page.locator('[data-testid="reader-start"][data-ready="true"]').waitFor();
  const boot=async()=>{await page.getByTestId('reader-start').click();await page.locator('.reader-surface iframe[aria-busy="false"]').waitFor({timeout:240000});const frame=page.frames().find(frame=>new URL(frame.url()).pathname==='/__ons/runtime/clannad');assert(frame);return {frame,canvas:frame.locator('canvas')}};
  async function picture(canvas,name,previous){const file=out+'/'+width+'-'+name+'.png';for(let attempt=0;attempt<30;attempt++){await canvas.screenshot({path:file});const quality=JSON.parse(execFileSync('python3',['-c',pixelCode,file],{encoding:'utf8'}));if(quality.nonBlack>.2&&(!previous||quality.signature!==previous.signature))return quality;await page.waitForTimeout(500)}throw Error('No readable changed canvas: '+name)}
  const first=await boot(),initial=await picture(first.canvas,'initial');await first.canvas.click();const advanced=await picture(first.canvas,'after-input',initial);
  await page.getByRole('button',{name:'游戏菜单',exact:true}).click();await picture(first.canvas,'menu');await first.canvas.press('Escape');
  const native=await first.frame.evaluate(()=>{const FS=g_onsyuri_module.FS;return FS.readdir('/save').filter(name=>name!=='.'&&name!=='..').map(path=>({path,data:Array.from(FS.readFile('/save/'+path))})).sort((a,b)=>a.path.localeCompare(b.path))});assert(native.length>0);
  const stop=async()=>{await page.getByRole('button',{name:'结束阅读',exact:true}).click();await page.locator('.reader-save-status').filter({hasText:'阅读已结束，本机副本已保留'}).waitFor({timeout:35000});assert.equal(await page.locator('.reader-surface iframe').count(),0)};
  await stop();
  const head=await page.evaluate(async()=>{const store=await(await import('/ons/storage.mjs')).openSaveStore();try{const head=await store.get('clannad');return head?{revision:head.revision,files:head.snapshot.files.map(file=>({path:file.path,data:Array.from(file.data)})).sort((a,b)=>a.path.localeCompare(b.path))}:null}finally{store.close()}});assert(head);assert.deepEqual(head.files,native);
  const second=await boot(),reentered=await picture(second.canvas,'reentered');await stop();await Promise.all(runtimeBodies);assert.equal(runtimeHeaders.length,2);
  for(const headers of runtimeHeaders){assert.equal(headers['cache-control'],'private, no-store, no-transform');assert.match(headers['content-security-policy'],/sandbox allow-scripts;/);assert(!headers['content-security-policy'].includes('allow-same-origin'))}
  assert.deepEqual(errors,[]);records.push({width,status:'passed',initial,advanced,reentered,snapshotFiles:head.files.length,snapshotBytes:head.files.reduce((sum,file)=>sum+file.data.length,0),localSnapshotExact:true,runtimeRequests:runtimeHeaders.length,jsdInjected:false,errors,productionWrites:false});writeFileSync(out+'/receipt.json',JSON.stringify({status:'running',revision,records},null,2));
 }catch(error){await page.screenshot({path:out+'/'+width+'-failure.png'}).catch(()=>{});writeFileSync(out+'/failure.json',JSON.stringify({width,error:error.stack,errors,runtimeHeaders},null,2));throw error}finally{await context.close()}
}writeFileSync(out+'/receipt.json',JSON.stringify({status:'passed',revision,records},null,2));console.log(JSON.stringify({status:'passed',revision,records}));}finally{await browser.close()}
