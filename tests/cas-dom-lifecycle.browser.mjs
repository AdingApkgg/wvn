// 合成原生浏览器回归：延迟/404/解析失败由夹具提供；实际 URL 仍必须在请求前映射。
import {test,after} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {chromium} from 'playwright';
const encode=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
const resourceURL=encode(readFileSync('public/player/cas-resources.mjs','utf8')+'\n//# sourceURL=cas-resources-fixture.mjs');
const domURL=encode(readFileSync('public/player/cas-dom.mjs','utf8').replace("'./cas-resources.mjs'",JSON.stringify(resourceURL))+'\n//# sourceURL=cas-dom-fixture.mjs');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});after(()=>browser.close());
const origin='https://wg-b2.saop.cc',names=['slow.css','fast.css','bad.css','parse.css','pic.png','text.png','sync.png','async.png','escape.png'];
const rows=names.map((path,index)=>({path,key:path,url:origin+'/'+(index+1).toString(16).repeat(64)+'.bin',sha256:(index+1).toString(16).repeat(64),bytes:10,contentType:path.endsWith('.css')?'text/css':'image/png'}));
async function setup(t){
 const page=await browser.newPage(),requests=[],failed=[];let unlock,seen;
 const release=new Promise(resolve=>unlock=resolve),slow=new Promise(resolve=>seen=resolve);
 page.on('request',r=>{if(r.url().startsWith(origin))requests.push(r.url())});page.on('requestfailed',r=>failed.push(r.url()));
 await page.route(origin+'/**',async route=>{
  const url=route.request().url(),row=rows.find(r=>r.url===url),name=row?.path;
  if(name==='slow.css'){seen();await release;}
  const body=name==='bad.css'?'not found':name==='parse.css'?'.x{background:url(missing.png)}':name?.endsWith('.css')?'.slow{color:rgb(1, 2, 3)}':Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1WQAAAAASUVORK5CYII=','base64');
  try{await route.fulfill({status:name==='bad.css'?404:200,headers:{'access-control-allow-origin':'*'},contentType:row?.contentType??'image/png',body});}catch{/* 已被原生AbortSignal取消的夹具没有响应消费者。 */}
 });
 await page.setContent('<base href="'+origin+'/__player/resource/test/"><div class="target"></div>');
 await page.evaluate(async({resourceURL,domURL,rows})=>{
  const {createCasResolver}=await import(resourceURL),{installCasBrowser}=await import(domURL);
  const manifest={schema:1,delivery:'cas',pilot:'test',versionId:'legacy-22f82f586933328e09f8545a',inventorySha256:'c'.repeat(64),resourceOrigin:'https://wg-b2.saop.cc',resources:rows,engineResources:{id:'engine',files:[]}};
  window.events={load:0,error:0};window.liveBlobs=new Set();window.revoked=[];
  const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=value=>{const url=create(value);liveBlobs.add(url);return url};URL.revokeObjectURL=url=>{liveBlobs.delete(url);revoked.push(url);return revoke(url)};
  window.api=installCasBrowser(window,createCasResolver(manifest,{id:'test',versionId:manifest.versionId}));
 },{resourceURL,domURL,rows});
 t.after(async()=>{unlock();await page.close()});return {page,requests,failed,slow,unlock};
}
for(const next of ['.last {color: blue}',''])test('late inline import cannot overwrite '+(next?'new text':'clear'),{timeout:10000},async t=>{
 const {page,slow,unlock}=await setup(t);await page.evaluate(()=>{window.style=document.createElement('style');style.textContent='@import "slow.css";';document.head.append(style)});await slow;
 await page.evaluate(value=>style.textContent=value,next);unlock();await page.evaluate(()=>api.ready().catch(()=>{}));assert.equal(await page.evaluate(()=>style.textContent),next);
});
for(const file of ['bad.css','parse.css'])test('linked '+file+' reports exactly one current error',{timeout:10000},async t=>{
 const {page}=await setup(t);await page.evaluate(file=>{window.link=document.createElement('link');link.rel='stylesheet';link.onload=()=>events.load++;link.onerror=()=>events.error++;link.href=file;document.head.append(link)},file);
 await page.evaluate(()=>api.ready().catch(()=>{}));assert.deepEqual(await page.evaluate(()=>events),{load:0,error:1});
});
for(const action of ['href','rel','node'])test('removing '+action+' cancels in-flight linked CSS',{timeout:10000},async t=>{
 const {page,slow,unlock,failed}=await setup(t);await page.evaluate(()=>{window.link=document.createElement('link');link.rel='stylesheet';link.onload=()=>events.load++;link.onerror=()=>events.error++;link.href='slow.css';document.head.append(link)});await slow;
 await page.evaluate(action=>{if(action==='href')link.removeAttribute('href');else if(action==='rel')link.rel='alternate';else link.remove()},action);unlock();await page.evaluate(()=>api.ready().catch(()=>{}));await page.waitForTimeout(30);
 const result=await page.evaluate(()=>({events,href:link.getAttribute('href'),blobs:liveBlobs.size}));assert.deepEqual(result.events,{load:0,error:0});assert(!result.href?.startsWith('blob:'));assert.equal(result.blobs,0);assert(failed.includes(rows[0].url),'Underlying CSS fetch must be aborted');
});
test('replacement keeps newest link and revokes the previous Blob',{timeout:10000},async t=>{
 const {page,slow,unlock}=await setup(t);await page.evaluate(()=>{window.link=document.createElement('link');link.rel='stylesheet';link.onload=()=>events.load++;link.onerror=()=>events.error++;link.href='fast.css';document.head.append(link)});await page.evaluate(()=>api.ready());
 const old=await page.evaluate(()=>link.href);await page.evaluate(()=>link.href='slow.css');await slow;await page.evaluate(()=>link.href='fast.css');unlock();await page.evaluate(()=>api.ready());
 const result=await page.evaluate(()=>({events,revoked,blobs:liveBlobs.size,sheet:!!link.sheet}));assert.equal(result.events.load,2);assert.equal(result.events.error,0);assert(result.revoked.includes(old));assert.equal(result.blobs,1);assert(result.sheet);
});
test('Text insertion, constructed stylesheet replacement and escaped CSS request only root hashes',{timeout:10000},async t=>{
 const {page,requests}=await setup(t);
 await page.evaluate(async()=>{
  const style=document.createElement('style');document.head.append(style);const node=document.createTextNode('.text{background-image:url(text.png)}');style.appendChild(node);if(node.parentNode!==style)throw Error('Text insertion changed native node identity');
  const sync=new CSSStyleSheet();sync.replaceSync('@import "slow.css"; .sync{background-image:url(sync.png)}');const asyncSheet=new CSSStyleSheet();await asyncSheet.replace('@import "slow.css"; .async{background-image:url(async.png)}');document.adoptedStyleSheets=[sync,asyncSheet];
  const escaped=document.createElement('style');escaped.textContent=String.raw`.escape{background-image:u\72l(escape.png)}`;document.head.append(escaped);
  for(const name of ['text','sync','async','escape']){const div=document.createElement('div');div.className=name;document.body.append(div);void getComputedStyle(div).backgroundImage;}
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 });
 await page.waitForTimeout(50);for(const name of ['text.png','sync.png','async.png','escape.png'])assert(requests.includes(rows.find(r=>r.path===name).url),'Missing mapped native request: '+name);assert(!requests.includes(rows[0].url),'Constructed stylesheets must retain native import-ignore behavior');assert(requests.every(url=>/^https:\/\/wg-b2\.saop\.cc\/[a-f0-9]{64}\.bin$/.test(url)),JSON.stringify(requests));
});
test('empty fetch and XHR URLs fail before any old-base network request',{timeout:10000},async t=>{
 const {page,requests}=await setup(t);const result=await page.evaluate(async()=>{let fetchFailed=false,xhrFailed=false;try{await fetch('')}catch{fetchFailed=true}try{new XMLHttpRequest().open('GET','')}catch{xhrFailed=true}return {fetchFailed,xhrFailed}});assert.deepEqual(result,{fetchFailed:true,xhrFailed:true});assert.deepEqual(requests,[]);
});
