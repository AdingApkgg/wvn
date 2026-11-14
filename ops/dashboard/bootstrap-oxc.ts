/** 只在本任务隔离预览注册测试管理员，并保存私有测试会话；不操作生产。 */
import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { hostname } from 'node:os';
import { previewChromiumOptions } from '../../scripts/lib/preview-browser.mjs';
import { authenticator, register, api } from '../../tests/helpers/account-browser.ts';
const base='/home/i/wvn-oxc-runtime-20261115',origin='https://localhost-1.tailac9c6f.ts.net:26883';
if(hostname()!=='localhost'||!process.env.TMUX||process.cwd()!==base+'/source')throw Error('仅限本任务构建机目录');
const browser=await chromium.launch({...previewChromiumOptions(base+'/private/tls.crt'),proxy:{server:'http://127.0.0.1:11090',bypass:'localhost,127.0.0.1,localhost-1.tailac9c6f.ts.net'}});
try{
 const context=await browser.newContext();await context.addInitScript('window.__name = function(fn) { return fn; }');const page=await context.newPage();await page.goto(origin+'/account');await authenticator(page);
 const result=await register(page,'后台预览管理员');if(result.status!==200)throw Error('测试注册失败');
 const me=(await api(page,'/api/me')).data;
 await mkdir(base+'/private',{recursive:true,mode:0o700});
 await context.storageState({path:base+'/private/admin-state.json'});
 await writeFile(base+'/private/admin-ids',me.user.id,{mode:0o600});
 console.log(JSON.stringify({registered:true,uid:me.user.uid}));
}finally{await browser.close()}
