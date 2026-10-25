import{test}from'node:test';import assert from'node:assert/strict';import{nativeCheckpoint}from'../scripts/lib/ons-native-checkpoint.mjs';
function file(line,colon,suffix=''){const b=Buffer.alloc(25);b.write('ONS');b[3]=2;b[4]=8;b.writeInt32LE(line,17);b.writeInt32LE(colon,21);return Buffer.concat([b,Buffer.from(suffix)])}
test('native checkpoint reads engine 2.8 script line and colon with optional native description',()=>{assert.deepEqual(nativeCheckpoint(file(10242,3)),{version:208,line:10242,colon:3});assert.deepEqual(nativeCheckpoint(file(799,0,'"native slot title"*')),{version:208,line:799,colon:0})});
test('unrecognized/truncated/invalid native data is never called a load proof',()=>{for(const b of[Buffer.from('fake save'),file(-1,0),file(1,-1),file(1,10001),file(1,0).subarray(0,7)])assert.throws(()=>nativeCheckpoint(b));const newer=file(1,0);newer[4]=9;assert.throws(()=>nativeCheckpoint(newer))});
import { nativeTextCheckpoint } from '../scripts/lib/ons-native-checkpoint.mjs';
function pages(texts,tags=texts.map(()=>'')) {
 const ints=(...n)=>{const b=Buffer.alloc(n.length*4);n.forEach((x,i)=>b.writeInt32LE(x,i*4));return b};
 const strings=a=>Buffer.concat(a.map(t=>Buffer.concat([Buffer.from(t),Buffer.from([0])])));
 return Buffer.concat([file(10,0).subarray(0,5),Buffer.alloc(80),ints(0,320,640,960,719,texts.length),strings(texts),ints(tags.length),strings(tags),ints(10,0)]);
}
test('native text history distinguishes progress inside a shared script subroutine',()=>{
 const a=nativeTextCheckpoint(pages(['first','second'],['one','']));
 const b=nativeTextCheckpoint(pages(['first','third'],['one','']));
 assert.equal(a.pageCount,2);assert.notEqual(a.pages,b.pages);assert.deepEqual(nativeTextCheckpoint(pages(['first','second'],['one',''])),a);
 assert.equal(nativeTextCheckpoint(pages([])).pageCount,0);
 assert.throws(()=>nativeTextCheckpoint(file(10,0)));
});

import { sameNativeStory } from '../scripts/lib/ons-native-checkpoint.mjs';
test('restoration must match A, with only documented text-preserving load hooks',()=>{
 const a={version:208,line:849,colon:0,pageCount:40,pages:'a'.repeat(64)};
 assert.equal(sameNativeStory(a,{...a}),true);
 assert.equal(sameNativeStory(a,{...a,line:850}),false);
 assert.equal(sameNativeStory(a,{...a,line:366},366),true);
 assert.equal(sameNativeStory(a,{...a,line:367},366),false);
 assert.equal(sameNativeStory(a,{...a,line:366,pages:'b'.repeat(64)},366),false);
 assert.equal(sameNativeStory({...a,pageCount:0},{...a,line:366,pageCount:0},366),false);
});
