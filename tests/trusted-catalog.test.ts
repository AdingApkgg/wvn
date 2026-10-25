import {test}from'node:test';import assert from'node:assert/strict';import{Hono}from'hono';import{Store}from'../src/server/store.ts';import{registerTrustedCatalog}from'../src/player/catalog.server.ts';
test('trusted catalog preserves root, BGM routes, APIs and entry redirects while closing legacy executables',async()=>{
 const store=new Store(':memory:');store.seed({snapshotAt:'2026-10-20',works:[{id:'b315601',title:'Test',originalTitle:'Test',aliases:[],evidence:'https://bgm.tv/subject/315601'}],versions:[{id:'test-version',workId:'b315601',number:1,title:'Test',legacyPath:'/old-game/',engine:'Tyrano'}]});
 try{const app=new Hono();registerTrustedCatalog(app,store,async req=>new Response('TRUSTED '+new URL(req.url).pathname));
 for(const path of ['/','/_root.data','/b315601/','/b315601/1/','/b315601.data','/b315601/1.data'])assert.equal((await app.request('https://localhost'+path)).status,200,path);
 assert.equal((await(await app.request('https://localhost/api/catalog')).json()).length,1);
 for(const path of ['/old-game/','/old-game/index.html','/old-game%2Findex.html']){const r=await app.request('https://localhost'+path);assert.equal(r.status,302,path);assert.equal(r.headers.get('location'),'/b315601/1/')}
 for(const path of ['/old-game/engine.js','/old-game/index.html.','/old-game/index.html%20','/manage','/api/manage/catalog','/state/catalog.db','/random/1/'])assert.equal((await app.request('https://localhost'+path)).status,404,path);
 }finally{store.close()}
});

test('trailing-slash navigation forwards work and version data without opening private paths',async()=>{
 const store=new Store(':memory:');store.seed({snapshotAt:'2026-10-25',works:[
  {id:'v4',title:'CLANNAD',originalTitle:'CLANNAD',aliases:[],evidence:'https://vndb.org/v4'},
  {id:'b315601',title:'Test',originalTitle:'Test',aliases:[],evidence:'https://bgm.tv/subject/315601'},
 ],versions:[
  {id:'clannad',workId:'v4',number:1,title:'CLANNAD',legacyPath:'/clannad/',engine:'ONS'},
  {id:'test-version',workId:'b315601',number:1,title:'Test',legacyPath:'/old-game/',engine:'Tyrano'},
 ]});
 try{
  const app=new Hono();registerTrustedCatalog(app,store,async req=>Response.json({pathname:new URL(req.url).pathname,routes:new URL(req.url).searchParams.get('_routes')}));
  for(const path of ['/4/_.data','/4/1/_.data','/b315601/_.data','/b315601/1/_.data']){
   const r=await app.request('https://localhost'+path+'?_routes=routes%2Fplay');
   assert.equal(r.status,200,path);
   assert.deepEqual(await r.json(),{pathname:path,routes:'routes/play'});
   assert.equal((await app.request('https://localhost'+path,{method:'HEAD'})).status,200,path+' HEAD');
   assert.equal((await app.request('https://localhost'+path,{method:'POST'})).status,404,path+' POST');
  }
  for(const path of ['/manage/_.data','/share-admin/_.data','/api/me/_.data','/state/catalog.db/_.data','/4/999/_.data','/unknown/1/_.data','/4/1/_.data/extra']){
   assert.equal((await app.request('https://localhost'+path)).status,404,path);
  }
 }finally{store.close()}
});
