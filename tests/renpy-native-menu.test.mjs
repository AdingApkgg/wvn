import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseNativeStart,chooseNativeChoice } from '../scripts/lib/renpy-native-menu.mjs';

test('native start waits for the menu and only dismisses the audited warning action',()=>{
  const hide={rect:[388,474,592,24],action:'Hide',screen:'warning'};
  const quit={rect:[389,537,296,24],action:'Quit'};
  assert.deepEqual(chooseNativeStart({warning:true,buttons:[hide,quit]}),{kind:'warning',rect:hide.rect});
  assert.equal(chooseNativeStart({warning:false,buttons:[hide,quit]}),null);
  assert.equal(chooseNativeStart({warning:true,buttons:[{...hide,screen:'preferences'},quit]}),null);
  assert.equal(chooseNativeStart({warning:true,buttons:[hide,{...hide},quit]}),null);
  assert.equal(chooseNativeStart({warning:true,buttons:[quit]}),null);
  assert.equal(chooseNativeStart({warning:false,buttons:[]}),null);
});

test('language selection is explicitly scoped and route choices never select unrelated menu actions',()=>{
 const languages={warning:false,buttons:[{rect:[810,515,300,50],action:'Language'},{rect:[810,407,300,50],action:'Language'}]};
 assert.equal(chooseNativeStart(languages),null);assert.deepEqual(chooseNativeStart(languages,{language:true}),{kind:'language',rect:[810,407,300,50]});
 const buttons=[{rect:[1,1,20,20],action:'Quit'},{rect:[1,50,20,20],action:'Return'},{rect:[1,100,20,20],action:'Jump'}];
 assert.equal(chooseNativeChoice({choice:false,buttons}),null);assert.deepEqual(chooseNativeChoice({choice:true,buttons}),[1,50,20,20]);
});

test('a real Start action takes precedence over warning and rejects unusable focus rectangles',()=>{
  const start={rect:[10,20,30,40],action:'Start'};
  assert.deepEqual(chooseNativeStart({warning:false,buttons:[start]}),{kind:'start',rect:start.rect});
  assert.equal(chooseNativeStart({warning:false,buttons:[{...start,rect:[10,20,0,40]}]}),null);
});
