import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseNativeStart,chooseNativeChoice,shouldAdvanceOpening,chooseManualSavePage,chooseNativeFileLoad,filesForNativeSlot } from '../scripts/lib/renpy-native-menu.mjs';

test('native slot byte comparison handles numeric and token-suffixed names without an empty match',()=>{
 const files=['saves/1.save','saves/1-LT1.save','saves/1-1-LT1.save','saves/auto-1-LT1.save'].map(path=>({path}));
 assert.deepEqual(filesForNativeSlot(files,'1'),files.slice(0,2));assert.deepEqual(filesForNativeSlot(files,'1-1'),[files[2]]);assert.deepEqual(filesForNativeSlot(files,'2'),[]);
});

test('FileLoad selects the exact native slot and never the earlier auto-save',()=>{
 const buttons=[{rect:[1,1,10,10],action:'FileLoad',slot:'auto-1'},{rect:[20,1,10,10],action:'FileLoad',slot:'1'},{rect:[30,1,10,10],action:'FileLoad',slot:'1-1'}];
 assert.deepEqual(chooseNativeFileLoad(buttons,'1'),buttons[1].rect);assert.deepEqual(chooseNativeFileLoad(buttons,'1-1'),buttons[2].rect);assert.equal(chooseNativeFileLoad(buttons,'2'),null);
});

test('native load selects the first manual page rather than an auto-save page',()=>{
 const buttons=[{rect:[1,2,3,4],action:'FilePage',page:'auto'},{rect:[10,20,30,40],action:'FilePage',page:'1'},{rect:[20,20,30,40],action:'FileLoad',page:'None'}];
 assert.deepEqual(chooseManualSavePage(buttons),[10,20,30,40]);assert.equal(chooseManualSavePage(buttons.slice(0,1)),null);
});

test('opening pause advance is limited to an observed warning or language action',()=>{
 const blank={warning:false,buttons:[]};
 assert.equal(shouldAdvanceOpening(blank,[]),false);
 assert.equal(shouldAdvanceOpening(blank,['language']),true);
 assert.equal(shouldAdvanceOpening(blank,['warning']),true);
 assert.equal(shouldAdvanceOpening({...blank,warning:true},['warning']),false);
 assert.equal(shouldAdvanceOpening({...blank,buttons:[{}]},['language']),false);
 assert.equal(shouldAdvanceOpening(blank,['language',...Array(5).fill('advance-opening')]),false);
});

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
 const buttons=[{rect:[1,1,20,20],action:'Quit'},{rect:[1,50,20,20],action:'ChoiceReturn'},{rect:[1,100,20,20],action:'Jump'}];
 assert.equal(chooseNativeChoice({choice:false,buttons}),null);assert.deepEqual(chooseNativeChoice({choice:true,buttons}),[1,50,20,20]);
});

test('a real Start action takes precedence over warning and rejects unusable focus rectangles',()=>{
  const start={rect:[10,20,30,40],action:'Start'};
  assert.deepEqual(chooseNativeStart({warning:false,buttons:[start]}),{kind:'start',rect:start.rect});
  assert.equal(chooseNativeStart({warning:false,buttons:[{...start,rect:[10,20,0,40]}]}),null);
});
