import { AccountError } from '../src/accounts/errors.server.ts';
import { Hono } from 'hono';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareHttpFixture } from './helpers/share-http.ts';
import { mountDashboard } from '../src/accounts/dashboard.server.ts';

test('dashboard gates API and pages by account session and server allowlist', async () => {
  const f = await shareHttpFixture();
  try {
    const adminCookie = await f.register('Admin');
    const admin = await (await f.api('/api/me',adminCookie)).json();
    const readerCookie = await f.register('Reader');
    f.service.config.adminUserIds = [admin.user.id];
    f.service.app = new Hono().route("/", f.service.app).onError((error,c)=>c.json({code:error instanceof AccountError?error.code:"ERROR"},error instanceof AccountError?error.status:500));
    mountDashboard(f.service);
    assert.equal((await f.api('/api/dash/overview')).status,401);
    assert.equal((await f.api('/api/dash/overview',readerCookie)).status,403);
    assert.equal((await f.api('/api/dash/overview',adminCookie)).status,200);
    assert.equal((await f.api('/dash',readerCookie)).status,403);
    assert.equal((await f.api('/dash')).status,302);
    const list = await (await f.api('/api/dash/users?q=Reader',adminCookie)).json();
    assert.equal(list.items.length,1);
    assert.equal(list.items[0].name,'Reader');
    assert.equal(list.items[0].email,undefined);
    assert.equal((await f.api('/api/dash/users?page=0',adminCookie)).status,400);
    assert.equal((await f.service.app.request('https://accounts.wg.test/api/dash/users/1/moderate', {
      method:'POST',headers:{origin:'https://evil.test',cookie:adminCookie,'content-type':'application/json'},body:'{}',
    })).status,403);
    assert.equal((await f.service.app.request('https://accounts.wg.test/api/me/profile', {
      method:'PATCH',headers:{origin:'https://accounts.wg.test',cookie:readerCookie,'content-type':'application/json'},
      body:JSON.stringify({admin:true}),
    })).status,409);
    await f.service.db.prepare('UPDATE session SET "expiresAt"=$1').run(new Date(0));
    assert.equal((await f.api('/api/dash/overview',adminCookie)).status,401);
  } finally { await f.close(); }
});

test('dashboard audit identifies classification objects, nested reasons and failed revisions',async()=>{
  const {testStore}=await import('./helpers/catalog.ts');
  const f=await shareHttpFixture(), store=await testStore();
  try{
    const cookie=await f.register('Audit admin');
    const me=await(await f.api('/api/me',cookie)).json();
    f.service.config.adminUserIds=[me.user.id];
    f.service.app=new Hono().route('/',f.service.app).onError((error,c)=>c.json({code:error instanceof AccountError?error.code:'ERROR'},error instanceof AccountError?error.status:500));
    mountDashboard(f.service,{store,sources:{entries:[]}});
    const request=(body:unknown)=>f.service.app.request('https://accounts.wg.test/api/dash/manage/content-classification',{
      method:'PATCH',headers:{origin:'https://accounts.wg.test',cookie,'content-type':'application/json','x-wg-binding':me.binding},body:JSON.stringify(body),
    });
    for(const digit of ['a','b']){
      const id='/media/'+digit.repeat(64)+'.jpg',reason='核对图片 '+digit;
      const body={kind:'image',id,expectedRevision:0,payload:{sexual:'safe',violence:'tame',spoiler:false,reason,source:'manual:dashboard-test',reviewedAt:new Date().toISOString()}};
      assert.equal((await request(body)).status,200);
      assert.equal((await request(body)).status,409);
      const audit=await(await f.api('/api/dash/audit',cookie)).json();
      const records=audit.filter((row:any)=>row.target.includes(encodeURIComponent(id)));
      assert.equal(records.length,2);
      assert.deepEqual(records.map((row:any)=>row.status),[409,200]);
      assert.ok(records.every((row:any)=>row.reason===reason&&row.actor===me.user.id));
    }
  }finally{await store.close();await f.close()}
});
