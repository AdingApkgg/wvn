import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { z } from 'zod';
import { endpoint } from '../src/api/endpoint.ts';
import { registerJsonRoute, configureJsonRouteAuth } from '../src/api/route.server.ts';
import { createContractClient } from '../src/api/client-base.ts';

const contract = {
  read: endpoint('GET', '/api/test/{id}', z.object({ params: z.object({ id: z.string() }), query: z.object({ q: z.string().optional() }).optional() }), z.object({ id: z.string(), q: z.string() })),
  write: endpoint('PATCH', '/api/test/{id}', z.object({ params: z.object({ id: z.string() }), body: z.object({ name: z.string().min(1) }) }), z.object({ name: z.string() })),
};
test('oRPC typed client preserves REST paths, GET queries and middleware cookies', async () => {
 const app = new Hono();
 const seen: string[] = [];
 app.use('/api/*', async(c,next)=>{ seen.push(c.req.method+' '+c.req.path);c.header('Set-Cookie','session=refreshed; HttpOnly');await next(); });
 registerJsonRoute(app, contract.read, c=>c.json({id:c.req.param('id'),q:c.req.query('q')??''}));
 const client = createContractClient(contract, {baseUrl:'https://test.invalid', fetch: async(request)=>app.fetch(request as Request)});
 assert.deepEqual(await client.read({params:{id:'one'},query:{q:'hello world'}}), {id:'one',q:'hello world'});
 assert.deepEqual(seen,['GET /api/test/one']);
 const head=await app.request('https://test.invalid/api/test/one',{method:'HEAD'});
 assert.equal(head.status,200);assert.equal(await head.text(),'');
 const response = await app.request('https://test.invalid/api/test/one');
 assert.match(response.headers.get('set-cookie')??'', /session=refreshed/);
});
test('invalid input cannot run the business handler and body remains readable after middleware', async()=>{
 const app=new Hono();let writes=0;
 app.use('/api/*',async(c,next)=>{if(c.req.method==='PATCH')await c.req.json();await next();});
 registerJsonRoute(app,contract.write,async c=>{writes++;return c.json({name:(await c.req.json()).name},201);},{invalidCode:'NAME_INVALID'});
 const bad=await app.request('https://test.invalid/api/test/one',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name:''})});
 assert.equal(bad.status,400);assert.deepEqual(await bad.json(),{code:'NAME_INVALID'});assert.equal(writes,0);
 const good=await app.request('https://test.invalid/api/test/one',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name:'yes'})});
 assert.equal(good.status,201);assert.deepEqual(await good.json(),{name:'yes'});assert.equal(writes,1);
});
test('business errors and conflict payloads survive while invalid successful output is rejected',async()=>{
 const app=new Hono();app.onError((_error,c)=>c.json({code:'BUSINESS_ERROR'},403));
 registerJsonRoute(app,contract.read,()=>{throw Error('private business detail');});
 registerJsonRoute(app,contract.write,c=>c.json({code:'CONTENT_CONFLICT',head:'newer'},409));
 assert.equal((await app.request('https://test.invalid/api/test/one')).status,403);
 const conflict=await app.request('https://test.invalid/api/test/one',{method:'PATCH',headers:{'content-type':'application/json'},body:'{"name":"x"}'});
 assert.equal(conflict.status,409);assert.deepEqual(await conflict.json(),{code:'CONTENT_CONFLICT',head:'newer'});
 const broken=new Hono();registerJsonRoute(broken,contract.read,c=>c.json({password:'secret'}));
 const result=await broken.request('https://test.invalid/api/test/one');assert.equal(result.status,500);assert.deepEqual(await result.json(),{code:'RESPONSE_INVALID'});
});

test('protected API authenticates before validating a malformed request', async () => {
 const app = new Hono();
 configureJsonRouteAuth(app, async c => { if (c.req.header('x-wg-binding') !== 'current') throw Error('IDENTITY_CHANGED'); });
 app.onError((_error, c) => c.json({code:'IDENTITY_CHANGED'},409));
 const protectedWrite = endpoint('PATCH','/api/me/library/{id}',z.object({params:z.object({id:z.string()}),body:z.object({name:z.string()})}),z.object({name:z.string()}));
 let invoked = false;
 registerJsonRoute(app, protectedWrite, c => {invoked = true;return c.json({name:'unexpected'});});
 const result=await app.request('https://test.invalid/api/me/library/one',{method:'PATCH',headers:{'content-type':'application/json','x-wg-binding':'stale'},body:'{}'});
 assert.equal(result.status,409);assert.deepEqual(await result.json(),{code:'IDENTITY_CHANGED'});assert.equal(invoked,false);
});
test('typed transport checks captured owners and keeps full conflict data', async () => {
 const client=createContractClient(contract,{baseUrl:'https://test.invalid',beforeRequest:({owner})=>{if(owner==='old')throw Error('IDENTITY_CHANGED');},fetch:async()=>new Response(JSON.stringify({code:'CONTENT_CONFLICT',head:'newer'}),{status:409,headers:{'content-type':'application/json'}})});
 await assert.rejects(client.read({params:{id:'one'}},{context:{owner:'old'}}),/IDENTITY_CHANGED/);
 await assert.rejects(client.write({params:{id:'one'},body:{name:'x'}}),error=>error instanceof Error&&'data' in error&&JSON.stringify(error.data)==='{"code":"CONTENT_CONFLICT","head":"newer"}');
});

test('identity guard also covers a delayed response body and decoder completion', async () => {
 let epoch=0;
 let deliver!: () => void;
 const pending = new Promise<void>(resolve=>{deliver=resolve;});
 const client=createContractClient(contract,{
  baseUrl:'https://test.invalid',
  aroundCall:async(_context,invoke)=>{const start=epoch;const value=await invoke();if(start!==epoch)throw Error('IDENTITY_CHANGED');return value;},
  fetch:async()=>new Response(new ReadableStream({async start(controller){await pending;controller.enqueue(new TextEncoder().encode('{"id":"one","q":"old-account"}'));controller.close();}}),{headers:{'content-type':'application/json'}}),
 });
 const result=client.read({params:{id:'one'}});
 await new Promise(resolve=>setTimeout(resolve,0));
 epoch++;deliver();
 await assert.rejects(result,/IDENTITY_CHANGED/);
});
