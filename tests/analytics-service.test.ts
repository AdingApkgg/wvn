import test from 'node:test';import assert from 'node:assert/strict';import {createAccountService} from '../src/accounts/service.server.ts';
test('waiting for Umami does not hold the account API transaction lock',async t=>{
 let release!:(response:Response)=>void;let entered!:(value?:unknown)=>void;const enteredPromise=new Promise(r=>entered=r);
 t.mock.method(globalThis,'fetch',()=>{entered();return new Promise<Response>(r=>release=r)});
 const origin='https://wvn.test',service=await createAccountService({origin,secret:'s'.repeat(64),database:':memory:',analytics:{websiteId:'123e4567-e89b-42d3-a456-426614174000',internalUrl:'http://127.0.0.1:18561'}});
 try{
  const script=service.app.request(origin+'/_s/script.js');
  await Promise.race([enteredPromise,new Promise((_,reject)=>setTimeout(()=>reject(Error('Analytics proxy was not mounted')),300))]);
  const response=await Promise.race([service.app.request(origin+'/api/login-options'),new Promise<Response>((_,reject)=>setTimeout(()=>reject(Error('Account API blocked by analytics')),300))]);assert.equal(response.status,200);
  release(new Response('/* tracker */',{headers:{'content-type':'text/javascript'}}));assert.equal((await script).status,200);
  assert.equal((await service.app.request(origin+'/_s/api/websites')).status,404);
 }finally{release?.(new Response(''));service.close()}
});
