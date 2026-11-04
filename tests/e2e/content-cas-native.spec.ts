import {test,expect} from '@playwright/test';
import {authenticator,register,api} from '../helpers/account-browser';
import {RULE_QUESTIONS} from '../../src/content/quiz';

const origin=process.env.WG_CONTENT_TEST_URL;
test.skip(![process.env.WG_NSFW_TEST_URL,process.env.WG_UI_UX_TEST_URL].filter(Boolean).includes(origin)||process.env.WG_CONTENT_NATIVE_CAS!=='1','仅用于本任务隔离预览的真实CAS启动补验');
test.use({ignoreHTTPSErrors:false});
test.afterEach(async({page},info)=>{
 if(info.status!==info.expectedStatus)console.log('ONS保存失败诊断：'+JSON.stringify(await page.evaluate(()=>({events:(window as any).__casEvents??[],error:document.querySelector('.reader-error')?.textContent,status:document.querySelector('.reader-save-status')?.textContent})).catch(()=>({pageClosed:true}))));
});

test('真实ONS使用线上CAS域名启动并保留本机捕获后退出',async({page,context},info)=>{
 test.setTimeout(180_000);
 await context.grantPermissions(['local-network-access']);
 await page.addInitScript(()=>{
  const events:any[]=[];(window as any).__casEvents=events;
  const record=(event:Event)=>{const type=event.type,button=(event.target as Element)?.closest?.('button')?.textContent;if(['mousedown','mouseup','click'].includes(type)&&!button?.includes('结束阅读'))return;events.push({type,focused:document.hasFocus(),active:document.activeElement?.tagName,allowed:(event as CustomEvent).detail?.access?.canViewRestricted,button});if(events.length>80)events.shift()};
  for(const type of ['focus','blur','wg-content-change'])window.addEventListener(type,record);
  for(const type of ['mousedown','mouseup','click'])document.addEventListener(type,record,true);
 });
 const resources:string[]=[],oldRequests:string[]=[],mainBodies:string[]=[];
 page.on('request',request=>{const url=new URL(request.url());if(url.hostname==='wvn-s3-zi0.saop.cc')resources.push(request.url());if(url.hostname==='wg-b2.saop.cc')oldRequests.push(request.url())});
 page.on('response',response=>{const url=new URL(response.url());if(url.origin===origin&&[200,206].includes(response.status())&&/^\/__(?:ons\/(?:data|engine)|player\/resource|engines\/resource)\//.test(url.pathname))mainBodies.push(url.pathname)});
 await page.bringToFront();await page.goto(origin+'/health');await authenticator(page);
 expect((await register(page,'CAS域名真实启动验收')).status).toBe(200);
 const started=await api(page,'/api/me/content/attempts',{});expect(started.status).toBe(200);
 const answers=Object.fromEntries(started.data.questions.map((question:any)=>[question.id,RULE_QUESTIONS.find(row=>row.id===question.id)!.correctChoiceId]));
 const passed=await api(page,'/api/me/content/attempts/'+started.data.id+'/submit',{answers});expect(passed.status).toBe(200);expect(passed.data.passed).toBe(true);
 expect((await api(page,'/api/me/content/mode',{mode:'restricted'},'PATCH')).status).toBe(200);
 await page.goto(origin+'/4/1/');
 await expect(page.getByRole('button',{name:'开始阅读',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'开始阅读',exact:true}).click();
 await expect(page.getByRole('button',{name:'游戏菜单',exact:true})).toBeEnabled({timeout:120_000});
 expect(resources.length).toBeGreaterThan(0);
 expect(resources.every(url=>/^https:\/\/wvn-s3-zi0\.saop\.cc\/[a-f0-9]{64}\.bin$/.test(url))).toBe(true);
 expect(oldRequests).toEqual([]);expect(mainBodies).toEqual([]);
 const frame=page.frames().find(frame=>frame.url().includes('/__ons/runtime/clannad'))!;
 expect(await frame.locator('canvas').evaluate(canvas=>(canvas as HTMLCanvasElement).width)).toBeGreaterThan(0);
 console.log('真实ONS验收：引擎已启动，CAS新域名请求数='+resources.length);
 await page.screenshot({path:info.outputPath('cas-native-ons.png')});
 expect(await page.evaluate(()=>document.hasFocus()&&document.activeElement?.tagName==='IFRAME')).toBe(true);
 await page.getByRole('button',{name:'结束阅读',exact:true}).click();
 await expect(page.locator('.reader-save-status')).toContainText('阅读已结束，本机副本已保留',{timeout:35_000});
 const retained=await page.evaluate(async()=>{const path='/ons/storage.mjs';const {openSaveStore}=await import(path);const store=await openSaveStore();try{const head=await store.get('clannad');return !!head&&head.snapshot?.schema===1&&Array.isArray(head.snapshot.files)}finally{store.close()}});
 expect(retained).toBe(true);expect(oldRequests).toEqual([]);expect(mainBodies).toEqual([]);
});
