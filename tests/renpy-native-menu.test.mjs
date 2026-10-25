import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import { chooseNativeStart,chooseNativeChoice,shouldAdvanceOpening,chooseManualSavePage,chooseNativeFileLoad,filesForNativeSlot,isAuditedOpeningNotice,nativeClickablePoint } from '../scripts/lib/renpy-native-menu.mjs';

test('native click samples actual opaque target pixels and rejects an overlapping widget',async()=>{
 const setup="import types,json\ndef _test__slotname(name,page=None,slot=False): return '1-1'\nclass FileLoad:\n    def __init__(self): self.name='1';self.page=None;self.slot=False;self.confirm=True\n    def __call__(self): return _test__slotname(self.name,self.page,self.slot)\nwanted=types.SimpleNamespace(clicked=[FileLoad()])\nforeign=types.SimpleNamespace(clicked=[FileLoad()])\nf=types.SimpleNamespace(widget=wanted,x=0,y=0,w=100,h=100)\nrenpy=types.SimpleNamespace(store=types.SimpleNamespace(FileLoad=FileLoad),display=types.SimpleNamespace(focus=types.SimpleNamespace(focus_list=[f]),render=types.SimpleNamespace()))\n";
 async function run(overlaid){return nativeClickablePoint(async script=>{
  const code=setup+"renpy.display.render.focus_at_point=lambda x,y: types.SimpleNamespace(widget="+(overlaid?'foreign':'wanted')+") if 10<x<35 and 10<y<35 else None\nscope={}\nexec("+JSON.stringify(script)+",globals(),scope)\nprint(json.dumps(scope['result']))\n";
  const result=spawnSync('python3',['-c',code],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
 },{rect:[0,0,100,100],action:'FileLoad',screen:'None',page:'None',slot:'1-1',loadConfirm:true})}
 assert.deepEqual(await run(false),[25,25]);assert.equal(await run(true),null);
});

test('cold-start disclaimer advance is restricted to the observed notice and version family',()=>{
 const notice={mainMenu:false,confirm:false,buttons:[],text:'本作品免费首发于青桔网，请务必支持正版。'};
 assert.equal(isAuditedOpeningNotice('renpy-v44184-1',notice),true);
 assert.equal(isAuditedOpeningNotice('renpy-v44184-4',{...notice,text:'本移植仅供日语学习使用，对于违反以上条款而产生的后果，本组不负任何责任！'}),true);
 assert.equal(isAuditedOpeningNotice('renpy-v44184-4',{...notice,text:'本次移植增加了多语言框架，您可以随时在设置中切换为原语言'}),true);
 assert.equal(isAuditedOpeningNotice('renpy-v44184-2',{...notice,text:'当前版本是v0.91测试版，有许许多多未完成的功能。'}),true);
 assert.equal(isAuditedOpeningNotice('renpy-v44184-1',{...notice,text:'STAFF：移植：青桔 翻译：翻译组'}),true);
 assert.equal(isAuditedOpeningNotice('renpy-v44184-1',{...notice,text:'如果您能提供更好的翻译，稍后将在github公开翻译项目，提交通过后添加进游戏'}),true);
 assert.equal(isAuditedOpeningNotice('renpy-v562-1',notice),false);
 assert.equal(isAuditedOpeningNotice('renpy-v44184-1',{...notice,text:'继续剧情'}),false);
 assert.equal(isAuditedOpeningNotice('renpy-v44184-1',{...notice,confirm:true}),false);
});

test('native actions include nested RenPy RevertableList menu entries',async()=>{
 const {NATIVE_ACTIONS_PYTHON}=await import('../scripts/lib/renpy-native-menu.mjs');
 assert.equal(typeof NATIVE_ACTIONS_PYTHON,'string');
 const result=spawnSync('python3',['-c',NATIVE_ACTIONS_PYTHON+"\nclass RevertableList(list): pass\nassert list(_wvn_actions([1, RevertableList([2,(3,None)]),4])) == [1,2,3,4]\n"],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const scoped=spawnSync('python3',['-c',"scope={}\nexec("+JSON.stringify(NATIVE_ACTIONS_PYTHON+"\nresult=(lambda action: [v for v in action([1,[2,(3,None)],4])])(_wvn_actions)")+",{},scope)\nassert scope['result']==[1,2,3,4]\n"],{encoding:'utf8'});assert.equal(scoped.status,0,scoped.stderr);
});

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
