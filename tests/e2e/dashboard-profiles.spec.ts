import { test, expect } from '@playwright/test';
import { authenticator, register, api } from '../helpers/account-browser';
const adminState=process.env.WG_DASHBOARD_ADMIN_STATE;

test('个人资料默认保密，可保存公开主页并立即关闭',async({page})=>{
  await page.goto('/account?tab=security');
  await authenticator(page);
  expect((await register(page,'主页测试读者')).status).toBe(200);
  await page.reload();
  await expect(page.getByRole('heading',{name:'个人资料',exact:true})).toBeVisible();
  const own=await api(page,'/api/me/profile');
  expect(own.data.published).toBe(false);
  expect(own.data.uid).toMatch(/^[1-9]\d*$/);
  expect((await page.request.get('/u/'+own.data.uid)).status()).toBe(404);
  await page.getByLabel('昵称',{exact:true}).fill('新的读者昵称');
  await page.getByLabel('个人简介').fill('这里是我的个人简介。');
  await page.getByLabel('公开我的主页').check();
  await page.getByRole('button',{name:'保存个人资料',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'个人资料已保存'})).toBeVisible();
  await page.getByRole('link',{name:'查看我的主页'}).click();
  await expect(page.getByRole('heading',{name:'新的读者昵称',exact:true})).toBeVisible();
  await expect(page.getByText('这里是我的个人简介。',{exact:true})).toBeVisible();
  await expect(page.getByText('暂时没有可展示的公开分享。')).toBeVisible();
  await page.goto('/account?tab=security');
  await page.getByLabel('公开我的主页').uncheck();
  await page.getByRole('button',{name:'保存个人资料',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'个人资料已保存'})).toBeVisible();
  expect((await page.request.get('/u/'+own.data.uid)).status()).toBe(404);
  expect((await api(page,'/api/dash/overview')).status).toBe(403);
  expect((await page.request.get('/dash')).status()).toBe(403);
});

for(const width of [320,390,768,1440])test(`后台管理 ${width}px 布局及数据`,async({browser})=>{
  test.skip(!adminState,'需要隔离预览管理员会话');
  const context=await browser.newContext({storageState:adminState,viewport:{width,height:900}});
  const page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('/dash');
    await expect(page.getByRole('heading',{name:'全站概览'})).toBeVisible();
    await expect(page.locator('.dashboard-stats strong')).toHaveCount(4);
    await expect(page.getByRole('link',{name:'作品与版本',exact:true}).first()).toBeVisible();
    for(const [path,title] of [['users','用户管理'],['catalog','作品与版本'],['classification','作品与版本'],['shares','分享审核'],['audit','操作记录']]){
      await page.goto('/dash/'+path);
      await expect(page.getByRole('heading',{name:title,exact:true}).first()).toBeVisible();
      if(path==='catalog'||path==='classification')await expect(page.getByRole('button',{name:'登录管理',exact:true})).toHaveCount(0);
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    }
    await page.goto('/dash/users');
    await page.getByLabel('查找用户').fill('主页测试');await page.getByRole('button',{name:'搜索',exact:true}).click();
    await expect(page.getByText('正在读取用户…')).toHaveCount(0);
    await page.keyboard.press('Tab');
    expect(errors).toEqual([]);
    if(width===390||width===1440){await page.goto('/dash');await expect(page.locator('.dashboard-stats strong')).toHaveCount(4);await page.screenshot({path:`${process.env.WG_DASHBOARD_SCREENSHOTS??'reports'}/dashboard-${width}.png`,fullPage:true})}
  }finally{await context.close()}
});

test('管理员作品编辑保留修订冲突与审计记录',async({browser})=>{
  test.skip(!adminState,'需要隔离预览管理员会话');
  const context=await browser.newContext({storageState:adminState});const page=await context.newPage();
  try{
    await page.goto('/dash/catalog');
    const catalog=await api(page,'/api/dash/manage/catalog');expect(catalog.status).toBe(200);
    const work=catalog.data[0];
    await page.getByLabel('查找作品',{exact:true}).fill(work.id);
    const editor=page.locator('.work-editor:visible').first();
    await editor.getByRole('button',{name:'保存作品',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'已保存'})).toBeVisible();
    work.revision=(await api(page,'/api/dash/manage/catalog')).data.find((item:any)=>item.id===work.id).revision;
    const response=await api(page,'/api/dash/manage/works/'+work.id,{revision:work.revision,patch:{title:work.title}},'PATCH');expect(response.status).toBe(200);
    expect((await api(page,'/api/dash/manage/works/'+work.id,{revision:work.revision,patch:{title:work.title}},'PATCH')).status).toBe(409);
    const audit=await api(page,'/api/dash/audit');expect(audit.data.some((row:any)=>row.target.endsWith('/works/'+work.id)&&row.status===200)).toBe(true);
  }finally{await context.close()}
});

test('后台数据失败时提供重试，不要求另一个私有令牌',async({browser})=>{
  test.skip(!adminState,'需要隔离预览管理员会话');
  const context=await browser.newContext({storageState:adminState});const page=await context.newPage();
  try{
    await page.route('**/api/dash/manage/catalog',route=>route.fulfill({status:503,contentType:'application/json',body:'{"code":"UNAVAILABLE"}'}));
    await page.goto('/dash/catalog');
    await expect(page.getByRole('button',{name:'重试加载',exact:true})).toBeVisible();
    await expect(page.getByText('本次服务启动令牌',{exact:true})).toHaveCount(0);
    await page.unroute('**/api/dash/manage/catalog');
    await page.getByRole('button',{name:'重试加载',exact:true}).click();
    await expect(page.getByRole('button',{name:'重试加载',exact:true})).toHaveCount(0);
    await page.route('**/api/dash/shares/queue',route=>route.fulfill({status:503,contentType:'application/json',body:'{"code":"UNAVAILABLE"}'}));
    await page.goto('/dash/shares');
    await expect(page.getByRole('button',{name:'重试加载',exact:true})).toBeVisible();
    await expect(page.getByLabel('管理令牌',{exact:true})).toHaveCount(0);
  }finally{await context.close()}
});


test('隔离示例主页支持公开直达、无JS及手机与桌面截图',async({browser})=>{
  test.skip(!adminState,'需要隔离预览管理员会话');
  const context=await browser.newContext({storageState:adminState});const page=await context.newPage();
  try{
    await page.goto('/account?tab=security');
    const own=(await api(page,'/api/me/profile')).data;
    expect((await api(page,'/api/me/profile',{name:'WVN 预览管理员',bio:'欢迎来到我的读者主页。这里展示主动公开的资料和已审核分享。',published:true,revision:own.revision},'PATCH')).status).toBe(200);
    for(const width of [390,1440]){
      await page.setViewportSize({width,height:900});await page.goto('/u/'+own.uid);
      await expect(page.getByRole('heading',{name:'WVN 预览管理员',exact:true})).toBeVisible();
      await expect(page.getByText('暂时没有可展示的公开分享。')).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      await page.screenshot({path:`${process.env.WG_DASHBOARD_SCREENSHOTS??'reports'}/profile-${width}.png`,fullPage:true});
    }
    const anonymous=await browser.newContext({javaScriptEnabled:false});
    try{const direct=await anonymous.newPage();await direct.goto(new URL('/u/'+own.uid,page.url()).href);await expect(direct.getByRole('heading',{name:'WVN 预览管理员',exact:true})).toBeVisible()}finally{await anonymous.close()}
  }finally{await context.close()}
});
