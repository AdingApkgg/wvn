import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as client from '../public/player/resource-location.mjs';
const hash='a'.repeat(64),second='b'.repeat(64),origin='https://wg-b2.saop.cc';
const row=(path,sha256=hash)=>({path,key:'opaque/'+path,sha256,url:origin+'/'+sha256+'.bin',bytes:12,contentType:'application/octet-stream'});
const manifest=()=>({schema:1,delivery:'cas',pilot:'test',versionId:'11111111-1111-4111-8111-111111111111',inventorySha256:'c'.repeat(64),resourceOrigin:origin,resources:[row('dir/a #%.png'),row('game.zip'),row('style/main.css'),row('style/nested.css',second)],engineResources:{id:'engine',files:[row('renpy.wasm',second)]}});
test('manifest resolver maps scoped logical paths and exact returned URLs, never extension-derived keys',()=>{
 assert.equal(typeof client.createCasResolver,'function');
 const resolve=client.createCasResolver(manifest(),{id:'test',versionId:manifest().versionId});
 assert.equal(resolve.url('dir/a%20%23%25.png'),origin+'/'+hash+'.bin');
 assert.equal(resolve.url('/__player/resource/test/game.zip?cache=1'),origin+'/'+hash+'.bin');
 assert.equal(resolve.url('https://wg-b2.saop.cc/game.zip'),origin+'/'+hash+'.bin');
 assert.equal(resolve.url('renpy.wasm'),origin+'/'+second+'.bin');
 for(const path of ['missing.png','https://evil.invalid/game.zip','/__player/resource/other/game.zip',origin+'/'+'d'.repeat(64)+'.bin'])assert.throws(()=>resolve.url(path));
});
test('rejects wrong identities, origins, hash URLs, MIME, sizes and duplicate paths',()=>{
 assert.equal(typeof client.createCasResolver,'function');
 for(const change of [m=>m.pilot='other',m=>m.resources[0].url=origin+'/releases/a.png',m=>m.resources[0].bytes=-1,m=>m.resources[0].contentType='text/html\nX:1',m=>m.resources.push(m.resources[0]),m=>m.resources[0].path='../x']){
  const m=manifest();change(m);assert.throws(()=>client.createCasResolver(m,{id:'test',versionId:manifest().versionId}));
 }
});
test('CSS tokenizer respects comments, strings, escapes and recursive imports with a finite cycle',async()=>{
 assert.equal(typeof client.rewriteCasCss,'function');
 const resolve=client.createCasResolver(manifest(),{id:'test',versionId:manifest().versionId});
 const text='/* url(missing) */ @import "nested.css" screen; .a{content:"url(missing)";background:url("../dir/\\61 %20%23%25.png")}';
 const requests=[];
 const result=await client.rewriteCasCss(text,'style/main.css',resolve,async path=>{requests.push(path);return '@import "main.css"; .b{background:url(../game.zip)}';});
 assert.equal(requests.length,1);assert.match(result,/@media screen/);assert.match(result,/\/\* url\(missing\) \*\//);assert.match(result,/content:"url\(missing\)"/);assert(!result.includes('@import'));assert(result.includes(origin+'/'+hash+'.bin'));
});
test('original engine selection keeps game bytes while shared selection uses registered release',()=>{
 const m=manifest();m.resources.push(row('renpy.wasm'));
 const original=client.createCasResolver(m,{id:'test',versionId:m.versionId},{sharedEngine:false});
 assert.equal(original.url('renpy.wasm'),origin+'/'+hash+'.bin');
});
test('real legacy registry version identity is accepted without changing save identity',()=>{
 const m=manifest();m.versionId='legacy-22f82f586933328e09f8545a';
 assert.equal(client.createCasResolver(m,{id:'test',versionId:m.versionId}).manifest.versionId,'legacy-22f82f586933328e09f8545a');
});
test('CSS escaped function and at-keyword names are decoded before resolving resource URLs',async()=>{
 const m=manifest(),resolver=client.createCasResolver(m,{id:'test',versionId:m.versionId});
 const css=String.raw`/* u\72l(missing) */ @\69mport "nested.css"; .x{background:u\72l(../game.zip);content:"u\\72l(missing)"}`;
 const result=await client.rewriteCasCss(css,'style/main.css',resolver,async()=>'.nested { color:red }');
 assert(result.includes('.nested'));assert(result.includes(origin+'/'+hash+'.bin'));assert(!result.includes('@\\69mport'));assert(result.includes('/* u\\72l(missing) */'));
});
test('CSS input normalization preserves escaped identifiers across CRLF',()=>{
 const resolver=client.createCasResolver(manifest(),{id:'test',versionId:manifest().versionId});
 assert(client.rewriteCasCssUrls('.x{background:u\\72\r\nl(game.zip)}','index.html',resolver).includes(origin+'/'+hash+'.bin'));
});
