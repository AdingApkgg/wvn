import {test,expect} from '@playwright/test';
import {authenticator,register,api} from '../helpers/account-browser';
const state=process.env.WG_DASHBOARD_ADMIN_STATE;
test('管理员在用户管理中授予及撤销权限，目标现有会话立即生效',async({browser})=>{
 test.skip(!state,'需要独立预览管理员');
 const owner=await browser.newContext({storageState:state}),reader=await browser.newContext(),third=await browser.newContext();
 try{
  const a=await owner.newPage(),b=await reader.newPage();await b.goto('/account');await authenticator(b);
  const nickname='授权回归'+Date.now();expect((await register(b,nickname)).status).toBe(200);
  expect((await api(b,'/api/dash/overview')).status).toBe(403);
  const c=await third.newPage();await c.goto('/account');await authenticator(c);const thirdName='转授权回归'+Date.now();expect((await register(c,thirdName)).status).toBe(200);
  await a.goto('/dash/users');await a.getByLabel('查找用户').fill(nickname);await a.getByRole('button',{name:'搜索',exact:true}).click();
  await a.locator('.dashboard-users [data-slot=card]').filter({hasText:nickname}).getByRole('button',{name:'设为管理员',exact:true}).click();
  await a.getByLabel('权限变更理由').fill('用户管理授权回归');await a.getByRole('button',{name:'确认授予管理员',exact:true}).click();
  await expect(a.getByRole('status').filter({hasText:'管理员权限已更新'})).toBeVisible();
  expect((await api(b,'/api/me')).data.admin).toBe(true);await b.goto('/dash');await expect(b.getByRole('heading',{name:'全站概览'})).toBeVisible();
  await b.goto('/dash/users');await b.getByLabel('查找用户').fill(thirdName);await b.getByRole('button',{name:'搜索',exact:true}).click();await b.locator('.dashboard-users [data-slot=card]').filter({hasText:thirdName}).getByRole('button',{name:'设为管理员',exact:true}).click();await b.getByLabel('权限变更理由').fill('新管理员继续授权');await b.getByRole('button',{name:'确认授予管理员',exact:true}).click();await expect(b.getByRole('status').filter({hasText:'管理员权限已更新'})).toBeVisible();expect((await api(c,'/api/me')).data.admin).toBe(true);
  await a.locator('.dashboard-users [data-slot=card]').filter({hasText:nickname}).getByRole('button',{name:'撤销管理员',exact:true}).click();await a.getByLabel('权限变更理由').fill('撤销回归测试授权');await a.getByRole('button',{name:'确认撤销管理员',exact:true}).click();
  await expect(a.getByRole('status').filter({hasText:'管理员权限已更新'})).toBeVisible();
  expect((await api(b,'/api/me')).data.admin).toBe(false);expect((await api(b,'/api/dash/overview')).status).toBe(403);
  const me=(await api(a,'/api/me')).data;
  await a.getByLabel('查找用户').fill(me.user.uid);await a.getByRole('button',{name:'搜索',exact:true}).click();
  const ownerCard=a.locator('.dashboard-users [data-slot=card]').filter({hasText:me.user.id});await expect(ownerCard.getByText('受保护管理员',{exact:true})).toBeVisible();await expect(ownerCard.getByRole('button',{name:'撤销管理员',exact:true})).toHaveCount(0);
 }finally{await owner.close();await reader.close();await third.close()}
});
