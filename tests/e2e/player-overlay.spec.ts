import {test,expect} from '@playwright/test';
const origin=process.env.WG_IOS_TEST_URL;
test.skip(!origin||origin!==process.env.WG_TEST_URL,'仅本任务隔离预览');
test.use({actionTimeout:10000});
const runtime=`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#31495a}input{position:absolute;left:35%;top:45%;width:25%}</style><input aria-label="游戏输入"><script>window.instance=crypto.randomUUID();addEventListener('message',event=>{if(event.data?.type!=='WG_ONS_INIT'||!event.ports[0])return;const init=event.data,port=event.ports[0];let seq=0;port.onmessage=({data})=>{if(data.type==='snapshot')port.postMessage({type:'snapshot',pilot:init.pilot,nonce:init.nonce,seq:++seq,requestId:data.requestId,snapshot:init.snapshot})};port.postMessage({type:'started',pilot:init.pilot,nonce:init.nonce})});</script>`;
async function start(page:any,{native=false}={}){
 await page.addInitScript((native:boolean)=>{if(top===window){localStorage.setItem('wvn-whole-resource-mode','demand');if(!native){Object.defineProperty(Element.prototype,'requestFullscreen',{configurable:true,value:undefined});Object.defineProperty(Element.prototype,'webkitRequestFullscreen',{configurable:true,value:undefined})}}},native);
 await page.route('**/__ons/runtime/clannad**',(r:any)=>r.fulfill({contentType:'text/html',headers:{'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'cross-origin'},body:runtime}));
 await page.route('https://localhost:25286/__wvn_cache/index.html',(r:any)=>r.fulfill({contentType:'text/html',headers:{'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'cross-origin'},body:`<script>addEventListener('message',e=>{if(e.ports[0])e.ports[0].postMessage({type:'response',ok:false,nonce:e.data.nonce,planId:e.data.planId,name:'SecurityError',error:'storage denied'})})</script>`}));
 await page.goto('/4/1/');await page.getByTestId('reader-start').click();await expect(page.locator('.reader-surface iframe')).toHaveAttribute('aria-busy','false');
 return page.frames().find((f:any)=>f.url().includes('/__ons/runtime/clannad'))!;
}
test('reader iframe fills the viewport without pressing fullscreen in portrait, landscape and desktop',async({page})=>{
 for(const size of [{width:375,height:667},{width:667,height:375},{width:1440,height:900}]){
  await page.setViewportSize(size);if(size.width===375)await start(page);
  const box=await page.locator('.reader-surface iframe').boundingBox();expect(box!.x).toBe(0);expect(box!.y).toBe(0);expect(box!.width).toBe(size.width);expect(box!.height).toBe(size.height);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(size.width);
 }
});
test('controls overlay the game and can be hidden without losing the game instance or input',async({page})=>{
 await page.setViewportSize({width:375,height:667});const frame=await start(page);const value=await frame.evaluate(()=>(window as any).instance);await frame.getByLabel('游戏输入').fill('保留进度');
 const video=await page.locator('.reader-surface iframe').boundingBox(),toolbar=await page.locator('.reader-toolbar').boundingBox();expect(toolbar!.y).toBeGreaterThan(video!.y);expect(toolbar!.y+toolbar!.height).toBeLessThanOrEqual(video!.y+video!.height);
 await page.getByRole('button',{name:'隐藏操作',exact:true}).click();await expect(page.getByRole('button',{name:'游戏菜单',exact:true})).toBeHidden();await frame.getByLabel('游戏输入').click();await frame.getByLabel('游戏输入').fill('仍可输入');await page.getByRole('button',{name:'显示操作',exact:true}).click();await expect(page.getByRole('button',{name:'游戏菜单',exact:true})).toBeVisible();expect(await frame.evaluate(()=>(window as any).instance)).toBe(value);await expect(frame.getByLabel('游戏输入')).toHaveValue('仍可输入');
});
test('save and resource panels stay over the viewport and closing them preserves the same iframe',async({page})=>{
 await page.setViewportSize({width:375,height:667});const frame=await start(page);const value=await frame.evaluate(()=>(window as any).instance);
 await page.getByRole('button',{name:'存档与备份',exact:true}).click();const panel=page.getByRole('region',{name:'存档管理面板'});await expect(panel).toBeVisible();const box=await panel.boundingBox();expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height).toBeLessThanOrEqual(667);
 await page.getByRole('button',{name:'关闭存档面板',exact:true}).click();await expect(panel).toBeHidden();await page.getByRole('button',{name:'加载设置',exact:true}).click();await expect(page.locator('.advanced-tools')).toBeVisible();await page.getByRole('button',{name:'关闭加载设置',exact:true}).click();await expect(page.locator('.advanced-tools')).toBeHidden();expect(await frame.evaluate(()=>(window as any).instance)).toBe(value);
 await page.getByRole('link',{name:'返回作品',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('button',{name:'继续阅读',exact:true}).click();await expect(page.locator('.reader-surface iframe')).toHaveAttribute('aria-busy','false');
});

test('native browser fullscreen exits before save panels and leave confirmation without replacing the game',async({page,browserName})=>{
 test.skip(browserName!=='chromium','原生全屏交互在Chromium覆盖；WebKit使用API缺失回退用例');
 const frame=await start(page,{native:true}),identity=await frame.evaluate(()=>(window as any).instance);
 await page.getByRole('button',{name:'浏览器全屏',exact:true}).click();await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.classList.contains('reader-playview'))).toBe(true);
 await page.getByRole('button',{name:'存档与备份',exact:true}).click();await expect.poll(()=>page.evaluate(()=>document.fullscreenElement===null)).toBe(true);await expect(page.getByRole('region',{name:'存档管理面板'})).toBeVisible();await page.getByRole('button',{name:'关闭存档面板',exact:true}).click();
 await page.getByRole('button',{name:'浏览器全屏',exact:true}).click();await page.getByRole('link',{name:'返回作品',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await expect.poll(()=>page.evaluate(()=>document.fullscreenElement===null)).toBe(true);await page.getByRole('button',{name:'继续阅读',exact:true}).click();expect(await frame.evaluate(()=>(window as any).instance)).toBe(identity);
});
