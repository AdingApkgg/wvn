// 只在本轮隔离预览验证目录、搜索、版本入口与直连清单。
import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {webgalPlayers} from '../public/player/webgal-registry.mjs';import {previewChromiumOptions} from './lib/preview-browser.mjs';
const origin=process.env.WG_QA_BASE_URL,out=process.env.WG_QA_RESULTS_ROOT;assert.equal(origin,'https://localhost-1.tailac9c6f.ts.net:19482');assert(out);fs.mkdirSync(out,{recursive:true});
const options=previewChromiumOptions(process.env.WG_QA_TLS_CERT);options.proxy={server:'http://127.0.0.1:11090',bypass:'localhost,127.0.0.1,localhost-1.tailac9c6f.ts.net,100.116.74.36'};
const browser=await chromium.launch(options);
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 assert.equal((await page.goto(origin)).status(),200);await page.getByRole('heading',{name:'在线视觉小说',exact:true}).waitFor();assert.match(await page.locator('.catalog-heading').innerText(),/72 部作品.*94 个版本/);
 await page.getByRole('searchbox',{name:'搜索作品'}).fill('宿星');await page.getByRole('button',{name:'查找',exact:true}).click();await page.waitForURL(/q=/);await page.locator('.story-card').first().waitFor();assert.equal(await page.locator('.story-card').count(),3);
 await page.screenshot({path:out+'/search.png',fullPage:true});
 const entries=[];
 for(const entry of webgalPlayers){
  const work='/'+entry.workId.slice(1)+'/';assert.equal((await page.goto(origin+work)).status(),200);const versions=page.locator('#work-versions');if(await versions.getAttribute('open')===null)await versions.locator('summary').first().click();await versions.locator('a[href="'+entry.route+'"]').waitFor();
  const response=await page.request.get(origin+'/api/player/'+entry.id+'/resources');assert.equal(response.status(),200);const manifest=await response.json();assert.equal(manifest.versionId,entry.versionId);assert(manifest.resources.length>1000);assert(manifest.resources.every(r=>r.url==='https://wg-b2.saop.cc/'+r.sha256+'.bin'));entries.push({id:entry.id,work,route:entry.route,resourceCount:manifest.resources.length});
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/result.json',JSON.stringify({status:'passed',works:72,versions:94,searchHits:3,entries},null,2));console.log(JSON.stringify({status:'passed',entries:entries.length,searchHits:3}));
}finally{await browser.close();}
