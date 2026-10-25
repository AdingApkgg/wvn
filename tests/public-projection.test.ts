import{test}from'node:test';import assert from'node:assert/strict';import{configurePublicProjection,publicProjectionFetch}from'../src/accounts/public-projection.server.ts';
test('same-process public share SSR never forwards cookies and cannot call private or foreign endpoints',async()=>{
 const seen:Request[]=[];configurePublicProjection('https://wg.saop.cc',request=>{seen.push(request);return new Response('{}',{headers:{'content-type':'application/json'}})});const fetch=publicProjectionFetch()!;
 assert.equal((await fetch('https://wg.saop.cc/api/public/works/v4/save-shares',{headers:{Cookie:'private=secret','x-wg-binding':'binding'}})).status,200);
 assert.equal(seen.length,1);assert.equal(seen[0].headers.get('Cookie'),null);assert.equal(seen[0].headers.get('x-wg-binding'),null);
 for(const url of ['https://wg.saop.cc/api/me','https://else.invalid/api/public/a'])assert.equal((await fetch(url)).status,404);
 assert.equal((await fetch('https://wg.saop.cc/api/public/a',{method:'POST'})).status,404);assert.equal(seen.length,1);
});
