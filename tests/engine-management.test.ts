import { testStore } from "./helpers/catalog.ts";
import {test} from 'node:test';import assert from'node:assert/strict';
import{Store}from'../src/server/store.ts';import{Auth}from'../src/server/auth.ts';import{createAdminApp,createPublicApp}from'../src/server/http.ts';

(test('engine management is private, authenticated and exposes no execution endpoint',async()=>{
 const store=await testStore(),auth=new Auth('engine-qa-token');
 try{
  const app=createAdminApp(store,auth,{}),pub=createPublicApp(store,'.');
  assert.equal((await pub.request('/api/manage/engines')).status,404);assert.equal((await app.request('/api/manage/engines')).status,401);
  const session=auth.login('engine-qa-token')!,headers={Cookie:'wg_session='+session};
  const response=await app.request('/api/manage/engines',{headers});assert.equal(response.status,200);const data=await response.json();assert.equal(data.versions,94);assert.equal(data.emscriptenVersions,83);
  assert.doesNotMatch(JSON.stringify(data),/\/home\/|secret|token|ssh/i);
  assert.equal((await app.request('https://localhost/api/manage/engines/build',{method:'POST',headers:{...headers,Origin:'https://localhost'}})).status,404);
 }finally{(await store.close());}
}));
