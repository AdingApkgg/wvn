import test from 'node:test';
import assert from 'node:assert/strict';
import {configureContentAccess,cacheContentAccess,getContentAccess} from '../src/content/access.server.ts';
import {PUBLIC_CONTENT_ACCESS} from '../src/content/policy.ts';
import {configurePublicProjection,publicProjectionFetch} from '../src/accounts/public-projection.server.ts';
import {createContentFetch} from '../src/content/http.server.ts';
const qualified={...PUBLIC_CONTENT_ACCESS,authenticated:true,eligibility:'qualified' as const,displayMode:'restricted' as const,canViewRestricted:true};
test('SSR share projection inherits trusted request access without widening origin or cookies',async()=>{
 configureContentAccess('https://wvn.test',async()=>({...PUBLIC_CONTENT_ACCESS}));
 let cookie:string|null='unobserved';
 const next=async(request:Request)=>{cookie=request.headers.get('cookie');const access=await getContentAccess(request);return Response.json({restricted:access.canViewRestricted})};
 const protectedFetch=createContentFetch(next,{} as never,{enabled:true,access:async()=>({...PUBLIC_CONTENT_ACCESS})});
 configurePublicProjection('https://wvn.test',protectedFetch);
 const viewer=new Request('http://wvn.test/4/',{headers:{cookie:'qa-only'}});
 cacheContentAccess(viewer,Promise.resolve(qualified));
 const response=await publicProjectionFetch(viewer)!('https://wvn.test/api/public/probe');
 assert.equal((await response.json()).restricted,true);assert.equal(cookie,null);
 const foreign=new Request('https://foreign.test/',{headers:{cookie:'qa-only','x-content-qualified':'true'}});
 assert.equal((await(await publicProjectionFetch(foreign)!('https://wvn.test/api/public/probe')).json()).restricted,false);
 assert.equal(cookie,null);
 assert.equal((await publicProjectionFetch(viewer)!('https://other.test/api/public/probe')).status,404);
});

test('listener and separately loaded SSR modules share trusted request cache',async()=>{
 const separate=await import(new URL('../src/content/access.server.ts?ssr-instance',import.meta.url).href);
 assert.notEqual(separate.cacheContentAccess,cacheContentAccess);
 const request=new Request('http://wvn.test/',{headers:{'x-content-qualified':'true'}});
 cacheContentAccess(request,Promise.resolve(qualified));
 assert.equal((await separate.getContentAccess(request)).canViewRestricted,true);
 const foreign=new Request('http://wvn.test/',{headers:{'x-content-qualified':'true'}});
 assert.equal((await separate.getContentAccess(foreign)).canViewRestricted,false);
});
