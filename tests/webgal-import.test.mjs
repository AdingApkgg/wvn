import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {createCasResolver} from '../public/player/cas-resources.mjs';
import {prepareWebgalResolver,installWebgalProbeFallback} from '../public/player/webgal-artemis.mjs';
import {webgalImportMetadata} from '../ops/b2/webgal-import-guard.mjs';
test('import requires reviewed metadata and retains existing works outside the new-work plan',()=>{
 const plan={works:[{id:'v4',evidence:'https://vndb.org/v4'}]};
 const row={workId:'v4',description:'Reviewed description',descriptionSource:'vndb',cover:{url:'/media/cover.jpg'},sources:[{provider:'vndb',id:'v4',url:'https://vndb.org/v4'}]};
 const doc={schemaVersion:1,works:[row,{...row,workId:'v5'}]};
 assert.deepEqual(webgalImportMetadata(plan,doc).works,[row]);assert.equal(doc.works.length,2);
 for(const works of [[],[row,row],[{...row,cover:null}],[{...row,description:' '}],[{...row,sources:[{provider:'vndb',id:'v5',url:'https://vndb.org/v5'}]}]])assert.throws(()=>webgalImportMetadata(plan,{works}));
});
test('newly imported works include reviewed covers, descriptions and source facts',()=>{
 const plan=JSON.parse(fs.readFileSync('data/imports/webgal-20261027.json','utf8'));
 const metadata=JSON.parse(fs.readFileSync('data/metadata.json','utf8'));
 for(const work of plan.works){
  const row=metadata.works.find(m=>m.workId===work.id);
  assert(row,`Missing reviewed metadata: ${work.id}`);
  assert(row.cover&&row.description.trim()&&row.released&&row.developers.length&&row.tags.length,`Incomplete reviewed metadata: ${work.id}`);
  assert(row.sources.some(s=>s.provider==='vndb'&&s.id===work.id));
 }
});
test('import adds distinct versions without changing the original catalog or save bindings',()=>{
 const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),plan=read('data/imports/webgal-20261027.json'),catalog=read('data/catalog.json'),bindings=read('engines/bindings.json').bindings;
 const ids=new Set(plan.versions.map(v=>v.id)),works=new Set(plan.works.map(w=>w.id));
 const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 assert.equal(ids.size,15);assert.equal(works.size,8);
 assert.equal(hash(catalog.versions.filter(v=>!ids.has(v.id))),plan.baseline.catalogVersionsSha256);
 assert.equal(hash(catalog.works.filter(w=>!works.has(w.id))),plan.baseline.catalogWorksSha256);
 assert.equal(hash(bindings.filter(b=>!ids.has(b.versionId))),plan.baseline.engineBindingsSha256);
 assert.deepEqual(plan.unavailable.map(v=>v.slug),['Saint-Necromancer']);assert(!plan.entries.some(e=>e.slug==='Saint-Necromancer'));
});
function fixture(text='image/a.png,'+'a'.repeat(40)+'\nimage/a,'+'a'.repeat(40)){
 const bytes=new TextEncoder().encode(text),hash=createHash('sha256').update(bytes).digest('hex');
 const rows=[{path:'hashlist.txt',sha256:hash,bytes:bytes.length,url:'https://wg-b2.saop.cc/'+hash+'.bin'},{path:'res/image/a.png',sha256:'b'.repeat(64),bytes:20,url:'https://wg-b2.saop.cc/'+'b'.repeat(64)+'.bin'}].map(row=>({...row,key:'12345678-1234-4234-8234-123456789abc',contentType:'application/octet-stream'}));
 const entry={id:'artemis-v27448-2',versionId:'legacy-'+'a'.repeat(24)},resolver=createCasResolver({schema:1,delivery:'cas',pilot:entry.id,versionId:entry.versionId,inventorySha256:'c'.repeat(64),resourceOrigin:'https://wg-b2.saop.cc',resources:rows,engineResources:{id:'engine',files:[]}},entry);
 return {resolver,fetcher:async()=>new Response(bytes)};
}
test('source hashlist aliases resolve to registered bytes without expanding the network manifest',async()=>{
 const f=fixture(),r=await prepareWebgalResolver(f.resolver,{fetcher:f.fetcher});
 assert.equal(r.url('res/image/a'),f.resolver.url('res/image/a.png'));
 assert.equal(r.files.size,2);assert.equal(r.optionalMissing('res/patch.ini'),true);
 assert.equal(r.optionalMissing('artemis.wasm'),false);assert.equal(r.optionalMissing('res/image/a'),false);
 assert.throws(()=>r.url('https://evil/asset'));assert.throws(()=>r.url('res/required-missing.png'));
});
test('different original hashes never become a shared extensionless alias',async()=>{
 const f=fixture('image/a.png,'+'a'.repeat(40)+'\nimage/a,'+'c'.repeat(40));
 const r=await prepareWebgalResolver(f.resolver,{fetcher:f.fetcher});assert.throws(()=>r.url('res/image/a'));assert.equal(r.optionalMissing('res/image/a'),true);
});
test('hashlist digest and bounded complete responses are required',async()=>{
 const f=fixture();await assert.rejects(prepareWebgalResolver(f.resolver,{fetcher:async()=>new Response('corrupted')}),/hashlist/);
 await assert.rejects(prepareWebgalResolver(f.resolver,{fetcher:async()=>new Response('',{status:404})}),/hashlist/);
});
test('source directory records remain optional probes and do not create object aliases',async()=>{
 const f=fixture('pc/ja/blog/name/,'+'a'.repeat(40)+'\nimage/a.png,'+'b'.repeat(40));
 const r=await prepareWebgalResolver(f.resolver,{fetcher:f.fetcher});for(const path of ['./','https://wg-b2.saop.cc/','res/','res/.','res/?v=1','res/pc/ja/blog/name/','res/pc//ja/'])assert(r.optionalMissing(path),path);assert.throws(()=>r.url('res/pc/ja/blog/name/'));assert.throws(()=>r.optionalMissing('https://evil.invalid/res/'));
});
test('unmapped package-local probes retain HTTP 404 semantics without hiding registered objects',async()=>{
 const f=fixture('debug/lua/index.lua,'+'c'.repeat(40)+'\nimage/a.png,'+'a'.repeat(40));
 const r=await prepareWebgalResolver(f.resolver,{fetcher:f.fetcher});assert(r.optionalMissing('res/debug/lua/index.lua'));assert(!r.optionalMissing('res/image/a.png'));assert(!r.optionalMissing('artemis.data'));assert(!r.optionalMissing('api/me'));
});
test('optional media errors stay scoped and cannot replace registered video objects',async()=>{
 const f=fixture(),r=await prepareWebgalResolver(f.resolver,{fetcher:f.fetcher});assert(r.missingMedia('movie_bai/logo.mp4'));assert(!r.missingMedia('res/image/a.png'));assert.throws(()=>r.missingMedia('https://evil.invalid/movie/logo.mp4'));
 f.resolver.files.set('movie/real.mp4',{path:'movie/real.mp4'});assert(!r.missingMedia('movie/real.mp4'));
});
test('skipping a paused intro handles AbortError while preserving real media failures',async()=>{
 class XHR{open(){}send(){}abort(){}}
 class Media{constructor(){this.paused=true;this.failure=Object.assign(Error('interrupted'),{name:'AbortError'})}setAttribute(){}play(){return Promise.reject(this.failure)}}
 const win={fetch:async()=>new Response(''),XMLHttpRequest:XHR,HTMLMediaElement:Media};installWebgalProbeFallback(win,{missingMedia:()=>false,optionalMissing:()=>false});
 const media=new Media();await media.play();media.paused=false;await assert.rejects(media.play(),{name:'AbortError'});media.paused=true;media.failure=Object.assign(Error('codec failure'),{name:'NotSupportedError'});await assert.rejects(media.play(),/codec/);
});
test('a reused XHR leaves a synthetic missing probe before a real resource request',async()=>{
 class XHR extends EventTarget{get status(){return this.nativeStatus??0}get readyState(){return this.nativeState??0}open(_method,url){this.url=url;this.nativeState=1}send(){this.nativeStatus=200;this.nativeState=4}abort(){this.nativeStatus=0;this.nativeState=0}}
 const win={fetch:async()=>new Response(''),XMLHttpRequest:XHR,Response,Event,ProgressEvent:Event};installWebgalProbeFallback(win,{missingMedia:()=>false,optionalMissing:url=>url==='probe'});
 const xhr=new XHR();xhr.open('GET','probe');xhr.send();await new Promise(resolve=>queueMicrotask(resolve));assert.equal(xhr.status,404);
 xhr.open('GET','registered');xhr.send();assert.equal(xhr.status,200);assert.equal(xhr.url,'registered');
 xhr.open('GET','probe');xhr.send();xhr.open('GET','registered');xhr.send();await new Promise(resolve=>queueMicrotask(resolve));assert.equal(xhr.status,200);
});
