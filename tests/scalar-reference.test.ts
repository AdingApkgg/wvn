import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import vm from 'node:vm';
import { mountApiReference, referenceBootstrap } from '../src/api/reference.server.ts';
import { generateOpenApiDocument } from '../src/api/openapi.server.ts';

test('Scalar documentation and all its resources stay behind the parent admin boundary',async()=>{
 const app=new Hono();
 app.use('*',async(c,next)=>{if(c.req.header('x-test-role')!=='admin')return c.json({code:'ADMIN_REQUIRED'},403);await next();});
 mountApiReference(app);
 for(const path of ['/dash/api','/api/dash/openapi.json','/api/dash/reference/scalar.js','/api/dash/reference/bootstrap.js']){
  assert.equal((await app.request(path)).status,403,path);
 }
 const response=await app.request('/dash/api',{headers:{'x-test-role':'admin'}});
 assert.equal(response.status,200);const html=await response.text();
 assert.match(html,/WVN API/);assert.match(html,/id="wvn-api-reference"/);assert.doesNotMatch(html,/id="api-reference"/);assert.match(html,/\/api\/dash\/reference\/scalar\.js/);
 assert.doesNotMatch(html,/https:\/\/(?:cdn|fonts|proxy)\./);
 const script=await app.request('/api/dash/reference/scalar.js',{headers:{'x-test-role':'admin'}});
 assert.equal(script.status,200);assert.match(script.headers.get('content-type')??'',/javascript/);assert.ok((await script.text()).length>1000);
});
test('runtime OpenAPI uses the shared contract without advertising private listeners',async()=>{
 const runtime=await generateOpenApiDocument();
 assert.ok(runtime.paths?.['/api/me/library']);assert.ok(runtime.paths?.['/api/dash/overview']);
 assert.equal(runtime.paths?.['/api/manage/login'],undefined);assert.equal(runtime.paths?.['/api/share-admin/login'],undefined);
 const exported=await generateOpenApiDocument({privateListeners:true});assert.ok(exported.paths?.['/api/manage/login']);
});
test('Scalar tester refreshes same-origin binding and rejects external requests without sending credentials',async()=>{
 let configuration:Record<string,any>|undefined;
 const sent:{url:string;init:RequestInit}[]=[];
 const context={window:{location:{origin:'https://wvn.test'},fetch:async(input:string|URL|Request,init:RequestInit={})=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;sent.push({url,init});return url.endsWith('/api/me')?Response.json({admin:true,binding:'fresh-binding'}):Response.json({ok:true});}},Scalar:{createApiReference:(_target:string,config:Record<string,any>)=>{configuration=config;}},Request,Response,Headers,URL,Error};
 vm.runInNewContext(referenceBootstrap,context);
 assert.ok(configuration);assert.equal(configuration.persistAuth,false);assert.equal(configuration.telemetry,false);assert.equal(configuration.withDefaultFonts,false);
 await configuration.customFetch('https://wvn.test/api/me/library',{method:'PATCH',body:'{}'});
 assert.equal(sent.length,2);assert.equal(new Headers(sent[1].init.headers).get('x-wg-binding'),'fresh-binding');assert.equal(sent[1].init.redirect,'error');assert.equal(sent[1].init.credentials,'same-origin');
 await assert.rejects(configuration.customFetch('https://outside.test/api/me/library'),/本站/);assert.equal(sent.length,2);
});

test('Scalar tester does not send the business request after admin access changes',async()=>{
 let configuration:Record<string,any>|undefined;let requests=0;
 vm.runInNewContext(referenceBootstrap,{window:{location:{origin:'https://wvn.test'},fetch:async()=>{requests++;return Response.json({admin:false,binding:'new-reader'});}},Scalar:{createApiReference:(_target:string,config:Record<string,any>)=>{configuration=config;}},Request,Response,Headers,URL,Error});
 await assert.rejects(configuration!.customFetch('https://wvn.test/api/dash/overview'),/管理/);assert.equal(requests,1);
});

test('Scalar tester preserves Request method, JSON body and caller headers',async()=>{
 let configuration:Record<string,any>|undefined;const sent:RequestInit[]=[];
 vm.runInNewContext(referenceBootstrap,{window:{location:{origin:'https://wvn.test'},fetch:async(input:string,init:RequestInit={})=>{if(input==='/api/me')return Response.json({admin:true,binding:'current'});sent.push(init);return Response.json({ok:true});}},Scalar:{createApiReference:(_target:string,config:Record<string,any>)=>{configuration=config;}},Request,Response,Headers,URL,Error});
 const controller=new AbortController();
 await configuration!.customFetch(new Request('https://wvn.test/api/me/profile',{method:'PATCH',headers:{'content-type':'application/json','x-caller':'preserved'},body:'{"name":"reader"}',signal:controller.signal}));
 assert.equal(sent[0].method,'PATCH');assert.equal(new TextDecoder().decode(sent[0].body as ArrayBuffer),'{"name":"reader"}');assert.equal(new Headers(sent[0].headers).get('x-caller'),'preserved');
});
