// Run on the private manager host with a locally installed browser. Never copy its token to another machine.
import fs from'node:fs';import assert from'node:assert/strict';import{chromium}from'playwright';
const root=process.env.WG_ENGINE_ADMIN_REPORT??'reports/emscripten/admin',origin='http://127.0.0.1:18554';fs.mkdirSync(root,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage'],proxy:{server:'http://127.0.0.1:11090',bypass:'localhost,127.0.0.1'}});
const context=await browser.newContext({viewport:{width:1360,height:960}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(origin+'/manage',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__reactRouterDataRouter?.state.initialized);
 await page.getByLabel('本次服务启动令牌').fill(fs.readFileSync('/home/wvn/wg-web-preview-20261024/state/emscripten-management-20261025/manager/admin-token','utf8').trim());await page.getByRole('button',{name:'登录管理',exact:true}).click();
 await page.getByRole('tab',{name:'引擎与 SDK',exact:true}).click();await page.getByRole('heading',{name:'引擎与 SDK',exact:true}).waitFor();await page.getByText('Emscripten 6.0.10',{exact:true}).waitFor();
 const summary=await page.evaluate(async()=>{const r=await fetch('/api/manage/engines');return {status:r.status,data:await r.json()};});assert.equal(summary.status,200);assert.equal(summary.data.versions,79);assert.equal(summary.data.emscriptenVersions,68);assert.doesNotMatch(JSON.stringify(summary.data),/\/home\/|token|secret|ssh/i);
 const layouts=[];for(const width of [1360,390]){await page.setViewportSize({width,height:960});const overflow=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));await page.screenshot({path:root+'/engines-'+width+'.png',fullPage:true});assert(overflow.scroll<=overflow.width+1,'Management layout overflows viewport');layouts.push({width,...overflow});}
 assert.deepEqual(errors,[]);const report={status:'passed',versions:79,emscriptenVersions:68,releases:summary.data.releases.length,layouts,errors,checkedAt:new Date().toISOString()};fs.writeFileSync(root+'/acceptance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){const report={status:'failed',error:error.message,errors};fs.writeFileSync(root+'/acceptance.json',JSON.stringify(report,null,2));await page.screenshot({path:root+'/failure.png',fullPage:true}).catch(()=>{});throw error;}
finally{await context.close();await browser.close();}
