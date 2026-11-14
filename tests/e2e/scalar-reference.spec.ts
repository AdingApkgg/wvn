import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { authenticator, register, api } from '../helpers/account-browser';

const origin=process.env.WG_SCALAR_TEST_URL;
test.skip(!origin,'需要本轮独立 Scalar QA');

test('管理员可浏览和下载 Scalar 文档，同源请求可用且普通用户无法访问',async({page},info)=>{
 test.setTimeout(60_000);
 const response=await page.goto(origin+'/dash/api');
 expect(response?.status()).toBe(200);await expect(page).toHaveURL(/\/account\?returnTo=/);
 for(const path of ['/api/dash/openapi.json','/api/dash/reference/scalar.js','/api/dash/reference/bootstrap.js'])expect((await page.request.get(origin+path)).status()).toBe(401);
 await authenticator(page);expect((await register(page,'Scalar 文档验收')).status).toBe(200);
 expect((await page.request.get(origin+'/api/dash/openapi.json')).status()).toBe(403);
 expect((await page.request.get(origin+'/dash/api')).status()).toBe(403);
 const owner=JSON.parse(await readFile(resolve('..','private','owner.json'),'utf8'));
 expect(owner.task).toBe('scalar-20261115');expect(owner.origin).toBe(origin);expect(owner.schemas.accounts).toBe('preview_scalar_20261115_accounts');
 const target=new URL(process.env.WVN_TEST_DATABASE_URL!);expect(target.username).toBe('wvn_qa');expect(target.pathname).toBe('/wvn_qa');expect(target.port).toBe('25539');
 const me=(await api(page,'/api/me')).data;
 const pool=new Pool({connectionString:process.env.WVN_TEST_DATABASE_URL!,max:1});
 try{await pool.query('INSERT INTO preview_scalar_20261115_accounts.wg_admin_roles(user_id,active,revision,updated_by) VALUES($1,true,1,$1)',[me.user.id]);}finally{await pool.end();}
 const failures:string[]=[],external:string[]=[];page.on('pageerror',error=>failures.push(error.message));page.on('request',request=>{if(new URL(request.url()).origin!==origin)external.push(request.url())});
 await page.route('**/api/dash/reference/bootstrap.js',async route=>{const response=await route.fetch();const source=await response.text();await route.fulfill({response,body:'const create=Scalar.createApiReference;Scalar.createApiReference=(target,configuration)=>{window.__scalarConfiguration=configuration;return create(target,configuration);};\n'+source});});
 const documentPage=await page.goto(origin+'/dash/api');expect(documentPage?.status()).toBe(200);
 await expect(page.locator('#wvn-api-reference').getByText('WVN Business API',{exact:true}).first()).toBeVisible({timeout:20_000});
 await expect(page.getByRole('button',{name:'Developer Tools',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:/Open Search/}).click();
 await page.getByRole('combobox',{name:'Enter search query'}).fill('/api/login-options');
 await expect(page.getByRole('option',{name:/Operation: \/api\/login-options/})).toBeVisible();
 await page.keyboard.press('Escape');
 const doc=await(await page.request.get(origin+'/api/dash/openapi.json')).json();expect(doc.paths['/api/me/library']).toBeTruthy();expect(doc.paths['/api/manage/login']).toBeUndefined();
 const result=await page.evaluate(async()=>{const configuration=(window as unknown as {__scalarConfiguration:{customFetch:typeof fetch}}).__scalarConfiguration;const response=await configuration.customFetch('/api/login-options');return {status:response.status,data:await response.json()};});
 expect(result.status).toBe(200);expect(result.data.passkey).toBe(true);
 const profile=(await api(page,'/api/me/profile')).data;
 const updated=await page.evaluate(async(profile)=>{const configuration=(window as unknown as {__scalarConfiguration:{customFetch:typeof fetch}}).__scalarConfiguration;const response=await configuration.customFetch(new Request(location.origin+'/api/me/profile',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name:profile.name,bio:'Scalar Request 对象调试',published:profile.published,revision:profile.revision})}));return {status:response.status,data:await response.json()};},profile);
 expect(updated.status).toBe(200);expect(updated.data.bio).toBe('Scalar Request 对象调试');

 const download=page.waitForEvent('download');await page.getByRole('link',{name:'下载 OpenAPI',exact:true}).click();const file=await download;expect(JSON.parse(await readFile((await file.path())!,'utf8')).paths['/api/me/library']).toBeTruthy();
 await page.screenshot({path:info.outputPath('scalar-reference.png'),fullPage:false});
 expect(failures).toEqual([]);expect(external).toEqual([]);
});
