import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {authenticator,register,api} from '../helpers/account-browser';
import {RULE_QUESTIONS} from '../../src/content/quiz';

const origin=process.env.WG_CONTENT_TEST_URL;
const uiUx=!!origin&&origin===process.env.WG_UI_UX_TEST_URL;
const admin=uiUx?'https://localhost:24684':'https://localhost:24484',moderation=uiUx?'https://localhost:24685':'https://localhost:24485';
test.skip(![process.env.WG_NSFW_TEST_URL,process.env.WG_UI_UX_TEST_URL].filter(Boolean).includes(origin),'只允许本任务隔离预览');
test.use({ignoreHTTPSErrors:false});

test('隔离预览验证真实权限、私有管理、CAS直连和运行实例的收起恢复及保存退出',async({page,context},info)=>{
 test.setTimeout(180_000);
 // Tailscale属于浏览器本地地址空间，仅在本测试context授予预览所需权限。
 await context.grantPermissions(['local-network-access']);
 const privateDir=resolve('..','private');
 const owner=JSON.parse(await readFile(resolve(privateDir,'owner.json'),'utf8'));
 expect(owner.task).toBe(uiUx?'ui-ux-20261104':'nsfw-20261104');expect(owner.origin).toBe(origin);
 const server=JSON.parse(await readFile(resolve(privateDir,'preview-process.json'),'utf8'));
 const sessionFile=resolve(privateDir,'browser-admin-session.json');
 const saved=await readFile(sessionFile,'utf8').then(JSON.parse,()=>null);
 if(saved?.pid===server.pid)await context.addCookies(saved.cookies);
 // 令牌仅来自本任务私有目录，既不写入报告也不进入公共浏览器页面。
 const manage=await context.newPage();await manage.goto(admin+'/manage');
 if((await manage.request.get(admin+'/api/manage/catalog')).status()!==200){
  await manage.getByLabel('本次服务启动令牌').fill(await readFile(resolve(privateDir,'catalog-admin-token'),'utf8'));
  await manage.getByRole('button',{name:'登录管理',exact:true}).click();
 }
 await manage.getByRole('tab',{name:'内容分类',exact:true}).click();
 await expect(manage.getByRole('tabpanel').getByRole('table')).toBeVisible();
 await manage.screenshot({path:info.outputPath('classification-admin.png'),fullPage:true});
 const mod=await context.newPage();await mod.goto(moderation+'/share-admin');
 if((await mod.request.get(moderation+'/api/share-admin/queue')).status()!==200){
  await mod.getByLabel('管理令牌').fill(await readFile(resolve(privateDir,'share-admin-token'),'utf8'));
  await mod.getByRole('button',{name:'进入审核后台',exact:true}).click();
 }
 await expect(mod.getByRole('heading',{name:'账号浏览资格',exact:true})).toBeVisible();
 await writeFile(sessionFile,JSON.stringify({pid:server.pid,cookies:await context.cookies([admin,moderation])}),{mode:0o600});

 const publicCatalog=await(await page.request.get(origin+'/api/catalog')).json();
 expect(publicCatalog.length).toBeGreaterThan(0);expect(publicCatalog.some((w:any)=>w.id==='v97')).toBe(false);
 const publicHtml=await(await page.request.get(origin+'/97/')).text();
 expect(publicHtml).not.toContain('沙耶之歌');expect(publicHtml).toContain('noindex,nofollow');
 expect((await page.request.get(origin+'/__ons/runtime/saya')).status()).toBe(401);
 expect((await page.request.head(origin+'/api/player/saya/resources')).status()).toBe(401);

 await page.bringToFront();await page.goto(origin+'/health');await authenticator(page);
 expect((await register(page,'隔离预览验收')).status).toBe(200);
 const started=await api(page,'/api/me/content/attempts',{});expect(started.status).toBe(200);
 const answers=Object.fromEntries(started.data.questions.map((q:any)=>[q.id,RULE_QUESTIONS.find(row=>row.id===q.id)!.correctChoiceId]));
 const passed=await api(page,'/api/me/content/attempts/'+started.data.id+'/submit',{answers});expect(passed.status).toBe(200);expect(passed.data.passed).toBe(true);
 const me=(await api(page,'/api/me')).data;
 const classifications=await(await manage.request.get(admin+'/api/manage/content-classification')).json();
 const version=classifications.find((row:any)=>row.kind==='version'&&row.id==='legacy-a1a835ec6184bfd5142f454f');
 const seeded=JSON.parse(await readFile(resolve('data/content-classification.json'),'utf8')).records.find((row:any)=>row.kind==='version'&&row.id===version.id)?.classification;
 const original={...(version.classification.source==='manual:isolated-preview-test'&&seeded?seeded:version.classification)};delete original.revision;
 async function classify(sexualContent:string,restore=false){
  const rows=await(await manage.request.get(admin+'/api/manage/content-classification')).json();
  const row=rows.find((item:any)=>item.kind==='version'&&item.id===version.id);
  const response=await manage.request.patch(admin+'/api/manage/content-classification',{headers:{origin:admin},data:{kind:'version',id:version.id,expectedRevision:row.classification.revision,payload:restore?original:{...original,sexualContent,source:'manual:isolated-preview-test',reason:'隔离预览的控制协议夹具，不作为真实游戏内容认定',reviewedAt:new Date().toISOString()}}});
  expect(response.status()).toBe(200);
 }
 // 控制桥使用真实应用与真实清单，仅引擎正文替换为可观测的协议夹具。
 // 它能验证离屏Audio、同一iframe、真实loader拒绝与本机快照；不声称完成整部游戏游玩。
 await page.route('**/__ons/runtime/clannad',route=>route.fulfill({contentType:'text/html',headers:{'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'cross-origin'},body:`<!doctype html><html><body>控制协议夹具<script>
 let audio,port,identity;window.fixtureId=crypto.randomUUID();window.pauseState=true;
 addEventListener('message',async event=>{if(event.data?.type!=='WG_ONS_INIT'||!event.ports[0])return;
 identity=event.data;port=event.ports[0];const {installContentVisibility}=await import('${origin}/player/content-visibility.mjs');const visibility=installContentVisibility(window);
 const wav=new Uint8Array(8044),view=new DataView(wav.buffer);const text=(offset,value)=>{for(let i=0;i<value.length;i++)wav[offset+i]=value.charCodeAt(i)};text(0,'RIFF');view.setUint32(4,8036,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,8000,true);view.setUint16(32,1,true);view.setUint16(34,8,true);text(36,'data');view.setUint32(40,8000,true);wav.fill(128,44);
 audio=new Audio(URL.createObjectURL(new Blob([wav],{type:'audio/wav'})));audio.loop=true;await audio.play();
 port.onmessage=async({data})=>{if(data.nonce!==identity.nonce)return;if(data.type==='content-visibility'){await visibility.setVisible(data.visible);window.pauseState=audio.paused}if(data.type==='snapshot')port.postMessage({type:'snapshot',pilot:identity.pilot,nonce:identity.nonce,seq:1,requestId:data.requestId,snapshot:{schema:1,pilot:identity.pilot,files:[]}})};
 window.pauseState=audio.paused;port.postMessage({type:'started',pilot:identity.pilot,nonce:identity.nonce});});
 </script></body></html>`}));
 try{
  await classify('none');await page.bringToFront();await page.goto(origin+'/4/1/');
  await expect(page.getByRole('button',{name:'开始阅读',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'开始阅读',exact:true}).click();
  await expect(page.getByRole('button',{name:'游戏菜单',exact:true})).toBeEnabled({timeout:60_000});
  console.log('预览验收：真实清单已连接控制桥');
  const frame=page.frames().find(frame=>frame.url().includes('/__ons/runtime/clannad'))!;
  const id=await frame.evaluate(()=> (window as any).fixtureId);
  expect(await frame.evaluate(()=> (window as any).pauseState)).toBe(false);
  await classify('present');
  await page.evaluate(()=>{const state=history.state;history.pushState(state,'',location.pathname+'?recheck=1');dispatchEvent(new PopStateEvent('popstate',{state}))});
  await expect(page.getByRole('heading',{name:'敏感内容已收起',exact:true})).toBeVisible();
  expect(await frame.evaluate(()=> (window as any).fixtureId)).toBe(id);
  await expect.poll(()=>frame.evaluate(()=> (window as any).pauseState)).toBe(true);
  await page.getByRole('button',{name:'开启 NSFW 显示',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'确认开启',exact:true}).click();
  await expect(page.getByRole('heading',{name:'敏感内容已收起',exact:true})).toHaveCount(0);
  expect(await frame.evaluate(()=> (window as any).fixtureId)).toBe(id);
  await expect.poll(()=>frame.evaluate(()=> (window as any).pauseState)).toBe(false);
  console.log('预览验收：同一实例已遮挡、静音并恢复');
  const manifest=(await api(page,'/api/player/clannad/resources')).data;
  expect(manifest.delivery).toBe('cas');
  const resource=manifest.resources.find((r:any)=>r.bytes>0);expect(resource).toBeTruthy();
  expect(resource.url).toMatch(/^https:\/\/wvn-s3-zi0\.saop\.cc\/[a-f0-9]{64}\.bin$/);
  const direct=await page.evaluate(async url=>{const response=await fetch(url,{headers:{range:'bytes=0-127'},credentials:'omit',signal:AbortSignal.timeout(20_000)});return {status:response.status,bytes:(await response.arrayBuffer()).byteLength}},resource.url);
  expect(direct.status).toBe(206);expect(direct.bytes).toBeLessThanOrEqual(128);
  console.log('预览验收：浏览器CAS直连Range已通过');
  const revoke=await mod.request.post(moderation+'/api/share-admin/content/users/'+me.user.id+'/moderate',{headers:{origin:moderation},data:{action:'suspend',reason:'本任务远程验收：持续前台资格撤销'}});expect(revoke.status()).toBe(200);
  await page.bringToFront();await expect(page.getByRole('heading',{name:'敏感内容已收起',exact:true})).toBeVisible({timeout:20_000});
  expect(await frame.evaluate(()=> (window as any).fixtureId)).toBe(id);
  await expect.poll(()=>frame.evaluate(()=> (window as any).pauseState)).toBe(true);
  await page.screenshot({path:info.outputPath('player-revoked-preserved.png'),fullPage:true});
  await page.getByRole('button',{name:'保存到本机后退出',exact:true}).click();
  await expect(page).toHaveURL(origin+'/4/',{timeout:15_000});
 }finally{await classify(original.sexualContent,true);await manage.close();await mod.close()}
});

test('公共作品实际安全封面可读，剧透截图按需展开且只请求已审核媒体',async({page},info)=>{
 const works=await(await page.request.get(origin+'/api/catalog')).json();
 const work=works.find((w:any)=>w.metadata?.cover&&w.metadata.screenshots.some((s:any)=>s.classification?.spoiler));expect(work).toBeTruthy();
 const allowed=new Set([work.metadata.cover,...work.metadata.screenshots].map((image:any)=>image.url));
 const requested:string[]=[];
 page.on('request',request=>{const path=new URL(request.url()).pathname;if(path.startsWith('/media/'))requested.push(path)});
 await page.goto(origin+work.url);
 const cover=page.locator('.work-cover');await expect(cover).toBeVisible();
 await expect.poll(()=>cover.evaluate(image=>image instanceof HTMLImageElement&&image.complete&&image.naturalWidth>0)).toBe(true);
 const number=work.metadata.screenshots.findIndex((image:any)=>image.classification?.spoiler)+1;
 const screenshot=page.getByAltText(`${work.title} · 截图 ${number}`,{exact:true});
 await expect(screenshot).toHaveCount(0);
 await page.getByRole('button',{name:`截图 ${number} 可能涉及剧透 · 点击查看`,exact:true}).click();
 await expect(screenshot).toBeVisible();
 await expect.poll(()=>screenshot.evaluate(image=>image instanceof HTMLImageElement&&image.complete&&image.naturalWidth>0)).toBe(true);
 await page.screenshot({path:info.outputPath('reviewed-gallery.png'),fullPage:true});
 expect(requested.length).toBeGreaterThan(0);expect(requested.every(path=>allowed.has(path))).toBe(true);
 await page.getByRole('button',{name:`收起截图 ${number}`,exact:true}).click();await expect(screenshot).toHaveCount(0);
});
