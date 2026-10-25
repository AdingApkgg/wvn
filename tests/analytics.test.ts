import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalAnalyticsPath,analyticsPayload} from '../src/analytics/contract.ts';
import {createAnalyticsApp} from '../src/analytics/proxy.server.ts';
const site='123e4567-e89b-42d3-a456-426614174000',origin='https://wvn.test';
test('analytics only admits canonical public pages and rebuilds payloads without private data',()=>{
 assert.equal(canonicalAnalyticsPath('/4/1/?session=private#slot'),'/4/1/');assert.equal(canonicalAnalyticsPath('/b315601/'),'/b315601/');
 for(const path of ['/account','/s/private','/manage','/__player/runtime/renpy-v4-1','https://evil.test/4/','//evil.test/4/','/04/','/4/../account'])assert.equal(canonicalAnalyticsPath(path),null);
 const x=analyticsPayload({type:'event',payload:{website:site,url:'/4/?secret=oops#private',title:'email@example.com',referrer:'https://private.test',id:'account-id',data:{token:'no'}}},site,'wvn.test');
 assert(x);assert.equal(x.payload.url,'/4/');assert(!/email|private|secret|account-id|token/.test(JSON.stringify(x)));
 assert.equal(analyticsPayload({type:'identify',payload:{website:site,url:'/4/'}},site,'wvn.test'),null);
 assert.equal(analyticsPayload({type:'event',payload:{website:'other',url:'/4/'}},site,'wvn.test'),null);
 assert.equal(analyticsPayload({type:'event',payload:{website:site,url:'/account'}},site,'wvn.test'),null);
 const event=analyticsPayload({type:'event',payload:{website:site,url:'/4/',name:'like',data:{enabled:true,email:'no',workId:'v99'}}},site,'wvn.test');
 assert.deepEqual(event?.payload.data,{workId:'v4',enabled:true});
 assert.equal(analyticsPayload({type:'event',payload:{website:site,url:'/4/',name:{toString:null}}},site,'wvn.test'),null);
});
test('same-origin proxy is a small whitelist and strips account and response credentials',async()=>{
 const requests:{url:string;init:RequestInit}[]=[];
 const app=createAnalyticsApp({origin,websiteId:site,internalUrl:'http://127.0.0.1:18561',fetch:async(url,init)=>{requests.push({url:String(url),init:init!});return new Response(JSON.stringify({cache:'anonymous-cache'}),{headers:{'content-type':'application/json','set-cookie':'private=forbidden','x-private':'no'}})}});
 const r=await app.request('/api/send',{method:'POST',headers:{origin,'content-type':'application/json',cookie:'account=private',authorization:'Bearer private','x-forwarded-for':'victim','x-umami-cache':'anon'},body:JSON.stringify({type:'event',payload:{website:site,url:'/4/?token=private'}})});
 assert.equal(r.status,200);assert.equal(requests.length,1);assert.equal(requests[0].url,'http://127.0.0.1:18561/api/send');
 const headers=new Headers(requests[0].init.headers);for(const n of ['cookie','authorization','x-forwarded-for','cf-connecting-ip'])assert.equal(headers.get(n),null);
 assert.equal(headers.get('x-umami-cache'),'anon');assert.equal(r.headers.get('set-cookie'),null);assert.equal(r.headers.get('x-private'),null);
 assert(!String(requests[0].init.body).includes('private'));
 for(const path of ['/api/auth/login','/api/websites','/script.js/../api/websites','/anywhere'])assert.equal((await app.request(path)).status,404);
 const bad=await app.request('/api/send',{method:'POST',headers:{origin:'null','content-type':'application/json'},body:'{}'});assert.equal(bad.status,403);
 const large=await app.request('/api/send',{method:'POST',headers:{origin,'content-type':'application/json'},body:'a'.repeat(65537)});assert.equal(large.status,413);
 assert.throws(()=>createAnalyticsApp({origin,websiteId:site,internalUrl:'https://remote.test'}));
});
test('analytics failure is bounded and never returns an upstream redirect',async()=>{
 const app=createAnalyticsApp({origin,websiteId:site,internalUrl:'http://127.0.0.1:18561',fetch:async()=>new Response(null,{status:302,headers:{location:'http://other.test/private'}})});
 assert.equal((await app.request('/script.js')).status,502);
 const failed=createAnalyticsApp({origin,websiteId:site,internalUrl:'http://127.0.0.1:18561',fetch:async()=>{throw Error('Unavailable')}});assert.equal((await failed.request('/script.js')).status,502);
});
