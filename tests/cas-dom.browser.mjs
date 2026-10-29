// 独立合成浏览器回归；路由仅提供测试夹具，不属于真实游戏验收。
import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
assert(existsSync('public/player/cas-dom.mjs'),'CAS DOM integration must exist');
const source=readFileSync('public/player/cas-resources.mjs','utf8'),moduleURL='data:text/javascript;base64,'+Buffer.from(source+'\n//# sourceURL=cas-resources-fixture.mjs').toString('base64');
const dom=readFileSync('public/player/cas-dom.mjs','utf8').replace("'./cas-resources.mjs'",JSON.stringify(moduleURL));
const domURL='data:text/javascript;base64,'+Buffer.from(dom+'\n//# sourceURL=cas-dom-fixture.mjs').toString('base64');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage(),requests=[];
 await page.route('https://wg-b2.saop.cc/**',route=>{requests.push(route.request().url());return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'text/css',body:'.x { background:url(pic.png) }'});});
 await page.setContent('<base href="https://wg-b2.saop.cc/__player/resource/test/"><template id="wg-cas-document"><div data-cas-body oncontextmenu="event.preventDefault()"><img src="pic.png"></div><style>.x{background:url(pic.png)}</style><link rel="stylesheet" href="main.css"></template>');
 assert.equal(requests.length,0);
 const result=await page.evaluate(async({moduleURL,domURL})=>{
  const {createCasResolver}=await import(moduleURL),{installCasBrowser}=await import(domURL);
  const hash='a'.repeat(64),hash2='b'.repeat(64),base='https://wg-b2.saop.cc/';
  const row=(path,sha)=>({path,key:path,sha256:sha,url:base+sha+'.bin',bytes:10,contentType:'text/css'});
  const manifest={schema:1,delivery:'cas',pilot:'test',versionId:'11111111-1111-4111-8111-111111111111',inventorySha256:'c'.repeat(64),resourceOrigin:'https://wg-b2.saop.cc',resources:[row('pic.png',hash),row('main.css',hash2)],engineResources:{id:'test',files:[]}};
  const resolver=createCasResolver(manifest,{id:'test',versionId:manifest.versionId});
  const api=installCasBrowser(window,resolver);await api.restoreDocument();
  const img=new Image();img.src='pic.png';img.srcset='data:image/png;base64,iVBORw0KGgo= 1x, pic.png 2x';document.body.append(img);
  const div=document.createElement('div');div.innerHTML='<img src="pic.png"><video poster="pic.png"></video>';document.body.append(div);
  const sheet=document.createElement('style');sheet.textContent='@import "main.css";';document.head.append(sheet);await api.ready();
  div.style.backgroundImage='url(pic.png)';const image=div.querySelector('img');image.setAttribute('src','pic.png');
  const controller=new AbortController();controller.abort();let aborted=false;try{await fetch('pic.png',{signal:controller.signal})}catch(e){aborted=e.name==='AbortError'}
  const xhr=new XMLHttpRequest();xhr.open('GET','pic.png',false);xhr.setRequestHeader('Range','bytes=0-1');xhr.send();
  return {srcset:img.srcset,srcs:[...document.querySelectorAll('img')].map(i=>i.src),poster:div.querySelector('video').poster,css:div.style.backgroundImage,aborted,bodyHandler:document.body.getAttribute('oncontextmenu'),nativeStylesheet:!!document.querySelector('link').sheet,xhrURL:xhr.responseURL};
 },{moduleURL,domURL});
 assert.equal(result.srcset,'data:image/png;base64,iVBORw0KGgo= 1x, https://wg-b2.saop.cc/'+'a'.repeat(64)+'.bin 2x');assert(result.srcs.length>=3);assert(result.srcs.every(s=>s==='https://wg-b2.saop.cc/'+'a'.repeat(64)+'.bin'));assert(result.poster.endsWith('a'.repeat(64)+'.bin'));assert(result.css.includes('a'.repeat(64)+'.bin'));assert(result.aborted);assert(result.nativeStylesheet,'Rewritten linked CSS must remain a native stylesheet');assert.equal(result.bodyHandler,'event.preventDefault()');assert(result.xhrURL.endsWith('a'.repeat(64)+'.bin'));
 assert(requests.length>0);assert(requests.every(url=>/^https:\/\/wg-b2\.saop\.cc\/[a-f0-9]{64}\.bin$/.test(url)));
 console.log('CAS synthetic browser URL/DOM/CSS/inert/Range/cancellation checks passed');
}finally{await browser.close()}
