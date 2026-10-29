import {test} from 'node:test';
import assert from 'node:assert/strict';
import assets from '../ops/b2/public-assets.mjs';
import {validateCasSources} from '../ops/b2/cas-provenance.mjs';
const base='https://wg-b2.saop.cc',release='releases/20261027-01/';
const ons='64ed1e7b9e92aa83b8106227d6095b3ab951e2bed75ac4bb8ed43f044737de04';
const shared='renpy-5b572ebfa6248cac249cab61f698c967cac82b7d225da7515971b383d0f0a3cf';
const row=(url,originalKey)=>({url:base+url,originalKey,source:'b2',key:'a'.repeat(64)+'.bin',sha256:'a'.repeat(64),cache:'MISS'});
const game='/__player/resource/artemis-v27448-1/artemis.js';
const correct=release+'games/'+assets.games['artemis-v27448-1']+'/artemis.js';
test('拒绝正确物理键但错误 originalKey 的发布、游戏、文件和残缺前缀',()=>{
 for(const wrong of ['releases/',correct.replace('20261027-01','20261028-01'),release+'games/clannad/onsyuri.js',correct+'extra',correct+'/'])assert.throws(()=>validateCasSources([row(game,wrong)]),wrong);
});
test('固定版本直接、canary、ONS 数据和引擎、共享引擎及媒体映射',()=>{
 const examples=[[game,correct],['/__cas-canary'+game,correct],['/'+correct,correct],['/__ons/data/ons-v1194-1/a%20b.ogg',release+'games/'+assets.games['ons-v1194-1']+'/a b.ogg'],['/__ons/engine/'+ons+'/onsyuri.wasm',release+'games/clannad/onsyuri.wasm'],['/__engines/resource/'+shared+'/renpy.wasm',release+'engines/'+shared+'/renpy.wasm']];
 const [alias,file]=Object.entries(assets.media)[0], [id,name]=alias.split('\0');examples.push(['/__player/resource/'+id+'/'+name.split('/').map(encodeURIComponent).join('/'),release+'media/'+file]);
 for(const [url,key] of examples){assert.throws(()=>validateCasSources([row(url,key+'wrong')]));assert.throws(()=>validateCasSources([row(url,key.replace('20261027-01','wrong-release'))]));}
 for(const [url,key] of examples)for(const cache of ['MISS','HIT'])assert.doesNotThrow(()=>validateCasSources([{...row(url,key),cache}]));
});
test('拒绝未知主机、发布、引擎、游戏、不安全路径和错误诊断',()=>{
 for(const url of ['/releases/wrong/games/clannad/a','/__ons/engine/wrong/onsyuri.js','/__engines/resource/wrong/renpy.wasm','/__player/resource/missing/a','/__player/resource/clannad/a%2F..%2Fb','/__cas-canary/__cas-canary'+game])assert.throws(()=>validateCasSources([row(url,correct)]));
 for(const patch of [{url:'https://evil.example'+game},{source:'local'},{key:'A'.repeat(64)+'.bin'},{cache:'unknown'},{sha256:'b'.repeat(64)}])assert.throws(()=>validateCasSources([{...row(game,correct),...patch}]));
 assert.throws(()=>validateCasSources([]));
});
