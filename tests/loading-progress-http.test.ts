import {test} from 'node:test';import assert from 'node:assert/strict';
import {Hono} from 'hono';import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {registerOnsModules} from '../src/ons/http.server.ts';

test('opaque players can read the dedicated loading module without exposing unregistered scripts',async()=>{
 const previous=process.cwd(),root=mkdtempSync(join(tmpdir(),'wvn-loading-'));
 try{
  mkdirSync(join(root,'public/ons'),{recursive:true});writeFileSync(join(root,'public/ons/loading.mjs'),'export const progress = true;');writeFileSync(join(root,'public/ons/resource-loading.mjs'),'export const resources = true;');process.chdir(root);
  const app=new Hono();registerOnsModules(app);
  const r=await app.request('https://localhost/ons/loading.mjs');assert.equal(r.status,200);assert.match(await r.text(),/progress/);assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.equal(r.headers.get('cache-control'),'no-store');
  const resources=await app.request('https://localhost/ons/resource-loading.mjs');assert.equal(resources.status,200);assert.equal(resources.headers.get('access-control-allow-origin'),'*');
  assert.equal((await app.request('https://localhost/ons/unregistered.mjs')).status,404);
 }finally{process.chdir(previous);rmSync(root,{recursive:true,force:true})}
});
