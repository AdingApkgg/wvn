import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
const browser=await chromium.launch({executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true,args:["--enable-unsafe-swiftshader"]});
try {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const results=[];
 for(const [pilot,path] of [["clannad","/4/1/"],["saya","/97/1/"]]) {
  const page=await context.newPage(); await page.goto("http://127.0.0.1:18481"+path,{waitUntil:"networkidle"});
  await page.getByRole("button",{name:"开始阅读",exact:true}).click();
  await page.getByRole("status").filter({hasText:"引擎已启动"}).waitFor({timeout:60000});
  await page.waitForTimeout(1500);
  const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  const frame=page.frames().find(f=>f.url().includes("/__ons/runtime/"));
  const box=await frame.locator("canvas").boundingBox();
  assert(layout.scroll<=layout.width+1);assert(box.width<=390);assert(box.height>100);
  mkdirSync("reports/ons-pilot",{recursive:true});
  await page.screenshot({path:`reports/ons-pilot/${pilot}-mobile.jpg`,fullPage:true,type:"jpeg",quality:55});
  results.push({pilot,layout,canvas:box});await page.close({runBeforeUnload:false});
 }
 writeFileSync("reports/ons-pilot/mobile.json",JSON.stringify({status:"passed",results},null,2));console.log(JSON.stringify(results));await context.close();
}finally{await browser.close()}
