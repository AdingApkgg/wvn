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
test('CSS Text-part rewriting preserves rule ownership and handles tokens spanning nodes',async()=>{
 const parts=await import('../public/player/cas-resources.mjs');assert.equal(typeof parts.rewriteCasCssParts,'function');
 const resolver=client.createCasResolver(manifest(),{id:'test',versionId:manifest().versionId});
 assert.deepEqual(parts.rewriteCasCssParts(['.a{color:red}', '.b{background:url(game.zip)}'],'index.html',resolver),['.a{color:red}', '.b{background:url("'+origin+'/'+hash+'.bin")}']);
 assert.deepEqual(parts.rewriteCasCssParts(['.a{background:u','rl(game.zip)', '}'],'index.html',resolver),['.a{background:url("'+origin+'/'+hash+'.bin")','','}']);
});
test('Tyrano missing decoration compatibility is bound to pilot, complete CSS hash and exact declaration',async()=>{
 const api=await import('../public/player/cas-resources.mjs');assert.equal(typeof api.applyCasCssCompatibility,'function');
 const sha='832bd58857e7687c61635c0a29aa28e05fdad430e56069952745fc5170a6501e',path='tyrano/libs/jquery-ui.css';
 const names=['animated-overlay.gif','ui-bg_highlight-soft_75_cccccc_1x100.png','ui-bg_glass_75_e6e6e6_1x400.png','ui-bg_glass_75_dadada_1x400.png','ui-bg_glass_65_ffffff_1x400.png','ui-bg_glass_55_fbf9ee_1x400.png','ui-bg_glass_95_fef1ec_1x400.png','ui-icons_888888_256x240.png','ui-icons_454545_256x240.png','ui-icons_454545_256x240.png','ui-icons_2e83ff_256x240.png','ui-icons_cd0a0a_256x240.png','ui-bg_flat_0_aaaaaa_40x100.png','ui-bg_flat_0_aaaaaa_40x100.png'];
 const source=names.map(name=>'.image{background: #cccccc '+(name.endsWith('.gif')?'url("images/'+name+'")':'url(images/'+name+')')+';}').join('\n');
 const m=manifest();m.pilot='tyrano-v49795-1';m.resources=[row(path,sha)];const resolver=client.createCasResolver(m,{id:m.pilot,versionId:m.versionId});
 for(const pilot of ['tyrano-b315601-1','tyrano-v18636-1','tyrano-v36554-1','tyrano-v36555-1','tyrano-v36556-1','tyrano-v36557-1','tyrano-v36558-1','tyrano-v49795-1']){resolver.manifest.pilot=pilot;assert.equal(api.applyCasCssCompatibility(source,path,resolver,sha).applied?.tokens,14)}
 const unknown=api.applyCasCssCompatibility(source+'.x{background:url(images/unknown.png)}',path,resolver,sha);assert.throws(()=>client.rewriteCasCssUrls(unknown.text,path,resolver),/Unregistered resource/);
 const result=api.applyCasCssCompatibility(source,path,resolver,sha);assert.equal(result.applied?.paths.length,12);assert.match(result.text,/background: #cccccc none;/);assert.doesNotThrow(()=>client.rewriteCasCssUrls(result.text,path,resolver));
 for(const [text,name,actualSha,pilot] of [[source,path,'a'.repeat(64),m.pilot],[source,path,sha,'test'],[source,'other.css',sha,m.pilot],[source.replace('animated-overlay.gif','other.gif'),path,sha,m.pilot]]){resolver.manifest.pilot=pilot;const denied=api.applyCasCssCompatibility(text,name,resolver,actualSha);assert.equal(denied.applied,undefined);assert.throws(()=>client.rewriteCasCssUrls(denied.text,name,resolver),/Unregistered resource/)}
});
