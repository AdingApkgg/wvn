import {test,expect} from '@playwright/test';
import {authenticator} from '../helpers/account-browser';
const origin=process.env.WG_IOS_TEST_URL;
test.skip(!origin||origin!==process.env.WG_TEST_URL,'仅本任务独立QA预览');
test.setTimeout(120000);
test.use({actionTimeout:10000});
const runtime=`<!doctype html><meta charset="utf-8"><input aria-label="游戏输入"><canvas width="640" height="480"></canvas><script>window.instance=crypto.randomUUID();const canvas=document.querySelector('canvas');canvas.getContext('2d').fillRect(0,0,640,480);addEventListener('message',event=>{if(event.data?.type!=='WG_ONS_INIT'||!event.ports[0])return;const data=event.data,port=event.ports[0];let seq=0;port.onmessage=({data:request})=>{if(request.type==='snapshot')port.postMessage({type:'snapshot',pilot:data.pilot,nonce:data.nonce,seq:++seq,requestId:request.requestId,snapshot:data.snapshot})};window.failResource=()=>port.postMessage({type:'resource-progress',pilot:data.pilot,nonce:data.nonce,active:0,failed:true});port.postMessage({type:'started',pilot:data.pilot,nonce:data.nonce});});</script>`;
async function reader(page:any,{mode='demand',storageError=false,integrityError=false,databaseDenied=false}={}){
 await page.addInitScript((mode:string)=>{if(top===window)localStorage.setItem('wvn-whole-resource-mode',mode)},mode);
 await page.route('**/__ons/runtime/clannad**',(route:any)=>route.fulfill({contentType:'text/html',headers:{'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'cross-origin'},body:runtime}));
 if(storageError||integrityError||databaseDenied)await page.route('https://localhost:25286/__wvn_cache/index.html',(route:any)=>route.fulfill({contentType:'text/html',headers:{'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'cross-origin'},body:`<script>addEventListener('message',event=>{if(!event.ports[0])return;event.ports[0].postMessage({type:'response',ok:false,nonce:event.data.nonce,planId:event.data.planId,name:'${databaseDenied?'UnknownError':storageError?'SecurityError':'Error'}',error:'${databaseDenied?'The user denied permission to access the database.':storageError?'storage denied':'Invalid cache file proof'}'})})</script>`}));
 await page.goto('/4/1/');await expect(page.getByTestId('reader-start')).toBeEnabled();
}
test('SE3 page fullscreen keeps the same iframe, input and visible exit control',async({page})=>{
 await page.setViewportSize({width:375,height:667});
 await page.addInitScript(()=>{Object.defineProperty(Element.prototype,'requestFullscreen',{configurable:true,value:undefined});Object.defineProperty(Element.prototype,'webkitRequestFullscreen',{configurable:true,value:undefined})});
 await reader(page,{storageError:true,mode:'background'});await page.getByTestId('reader-start').click();await expect(page.locator('.reader-surface iframe')).toHaveAttribute('aria-busy','false');
 const frame=page.frames().find(frame=>frame.url().includes('/__ons/runtime/clannad'))!;await frame.getByLabel('游戏输入').fill('进度保留');const identity=await frame.evaluate(()=>(window as any).instance);
 await page.getByRole('button',{name:'全屏',exact:true}).click();await expect(page.locator('.reader-page-fullscreen')).toBeVisible();await expect(page.getByRole('button',{name:'退出全屏',exact:true})).toBeVisible();
 const box=await page.locator('.reader-page-fullscreen').boundingBox();expect(box!.x).toBe(0);expect(box!.y).toBe(0);expect(box!.height).toBe(667);
 await page.getByRole('button',{name:'退出全屏',exact:true}).click();await expect(page.locator('.reader-page-fullscreen')).toHaveCount(0);expect(await frame.evaluate(()=>(window as any).instance)).toBe(identity);await expect(frame.getByLabel('游戏输入')).toHaveValue('进度保留');
 await page.getByRole('button',{name:'全屏',exact:true}).click();await page.getByRole('button',{name:'存档与备份',exact:true}).click();await expect(page.locator('.reader-page-fullscreen')).toHaveCount(0);
});
test('Safari cache denial falls back from background to demand without losing the startup manifest',async({page})=>{
 await reader(page,{storageError:true,mode:'background'});await page.getByTestId('reader-start').click();await expect(page.locator('.reader-surface iframe')).toHaveAttribute('aria-busy','false');await expect(page.getByText('此浏览器暂时无法使用资源缓存，本次已改为按需读取。存档和历史备份保留。',{exact:true})).toBeAttached();await expect(page.getByRole('combobox').filter({has:page.locator('option[value="demand"]')})).toHaveValue('demand');
});
test('database permission UnknownError can start with the validated manifest',async({page})=>{
 await reader(page,{databaseDenied:true,mode:'demand'});await page.getByTestId('reader-start').click();await expect(page.locator('.reader-surface iframe')).toHaveAttribute('aria-busy','false');await expect(page.getByText('此浏览器暂时无法使用资源缓存，本次已改为按需读取。存档和历史备份保留。',{exact:true})).toBeVisible();
});
test('cache integrity failure never falls back to unverified bytes',async({page})=>{
 await reader(page,{integrityError:true,mode:'background'});await page.getByTestId('reader-start').click();await expect(page.getByText(/Invalid cache file proof/).first()).toBeVisible();await expect(page.locator('.reader-surface iframe')).toHaveCount(0);await expect(page.getByRole('combobox').filter({has:page.locator('option[value="demand"]')})).toHaveValue('background');
});
test('complete mode reports unavailable cache rather than falsely starting a complete game',async({page})=>{
 await reader(page,{storageError:true,mode:'complete'});await page.getByTestId('reader-start').click();await expect(page.getByText(/storage denied/).first()).toBeVisible();await expect(page.locator('.reader-surface iframe')).toHaveCount(0);
});
test('resource failure remains visible and opens recovery tools',async({page})=>{
 await reader(page,{storageError:true,mode:'demand'});await page.getByTestId('reader-start').click();await expect(page.locator('.reader-surface iframe')).toHaveAttribute('aria-busy','false');const frame=page.frames().find(frame=>frame.url().includes('/__ons/runtime/clannad'))!;await frame.evaluate(()=>(window as any).failResource());await expect(page.getByRole('button',{name:'查看加载问题',exact:true})).toBeVisible();await page.waitForTimeout(8200);await expect(page.getByRole('button',{name:'查看加载问题',exact:true})).toBeVisible();await page.getByRole('button',{name:'查看加载问题',exact:true}).click();await expect(page.locator('.advanced-tools')).toHaveAttribute('open','');
});
test('cancelled FaceID/Passkey shows retry guidance next to the form and prevents overlapping ceremonies',async({page})=>{
 // Linux WebKit未提供系统验证器；此例只模拟取消回调，不证明Face ID可用。
 await page.addInitScript(()=>{if(typeof PublicKeyCredential!=='function')Object.defineProperty(window,'PublicKeyCredential',{configurable:true,value:class PublicKeyCredential{}});if(!navigator.credentials)Object.defineProperty(navigator,'credentials',{configurable:true,value:{create:()=>Promise.reject(new DOMException('mock only','NotSupportedError'))}});Object.defineProperty(navigator.credentials,'get',{configurable:true,value:()=>new Promise((_,reject)=>{(window as any).cancelTestCeremony=()=>reject(new DOMException('cancel','NotAllowedError'))})})});
 await page.goto('/account');await expect(page.getByRole('button',{name:'使用通行密钥登录',exact:true})).toBeEnabled();await page.getByRole('button',{name:'使用通行密钥登录',exact:true}).click();await expect(page.getByRole('button',{name:'等待设备验证…',exact:true})).toBeDisabled();await expect(page.getByRole('tab',{name:'创建账号',exact:true})).toBeDisabled();await page.waitForFunction(()=>typeof(window as any).cancelTestCeremony==='function');await page.evaluate(()=>(window as any).cancelTestCeremony());await expect(page.getByText('设备验证未完成，可能已取消或等待超时。准备好后可以重试。',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'使用通行密钥登录',exact:true})).toBeEnabled();
});
test('whitespace nickname never opens device registration and error stays beside the form',async({page})=>{
 // 此例只验证昵称校验，不调用系统验证器。
 await page.addInitScript(()=>{if(typeof PublicKeyCredential!=='function')Object.defineProperty(window,'PublicKeyCredential',{configurable:true,value:class PublicKeyCredential{}});if(!navigator.credentials)Object.defineProperty(navigator,'credentials',{configurable:true,value:{create:()=>Promise.reject(new DOMException('mock only','NotSupportedError')),get:()=>Promise.reject(new DOMException('mock only','NotSupportedError'))}})});
 await page.goto('/account');await page.getByRole('tab',{name:'创建账号',exact:true}).click();await page.getByLabel('昵称',{exact:true}).fill('   ');await page.getByRole('button',{name:'创建通行密钥并注册',exact:true}).click();await expect(page.locator('.account-login').getByRole('alert')).toContainText('昵称需要');await expect(page.getByLabel('昵称',{exact:true})).toHaveValue('   ');
});

test('real virtual Passkey registration returns to the original work and can sign out and sign in again',async({page,browserName})=>{
 test.skip(browserName!=='chromium','真实WebAuthn虚拟验证器只在Chromium可用，不冒充iPhone FaceID');
 await page.goto('/health');await authenticator(page);await page.goto('/account?returnTo=%2F4%2F1%2F');await page.getByRole('tab',{name:'创建账号',exact:true}).click();await page.getByLabel('昵称',{exact:true}).fill('账号交互回归');await page.getByRole('button',{name:'创建通行密钥并注册',exact:true}).click();await expect(page).toHaveURL(/\/4\/1\/$/);await page.goto('/account?tab=security');await expect(page.locator('[data-account-identity]')).toContainText('账号交互回归');await page.getByRole('button',{name:'退出账号',exact:true}).click();await expect(page.getByRole('button',{name:'使用通行密钥登录',exact:true})).toBeEnabled();await page.getByRole('button',{name:'使用通行密钥登录',exact:true}).click();await expect(page.locator('[data-account-identity]')).toContainText('账号交互回归');
});
