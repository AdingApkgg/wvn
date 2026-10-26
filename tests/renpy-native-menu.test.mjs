import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import { chooseNativeStart,chooseNativeChoice,shouldAdvanceOpening,chooseManualSavePage,chooseNativeFileLoad,filesForNativeSlot,isAuditedOpeningNotice,nativeClickablePoint,nativeFocus,nativeDialogueChanged,activateNativeWithKeyboard,saveNativeSlot,isNativeIntro,chooseNativePicker,nativePoint,nativeFocusState,isNativeBodyCheckpoint,clickNativeButton } from '../scripts/lib/renpy-native-menu.mjs';

test('nonrectangular native save buttons are discovered without inventing a clickable target',async()=>{
 const setup=`import types,json
def _test__slotname(name,page=None,slot=False): return '1-'+name
class FileLoad:
    def __call__(self): return _test__slotname(self.name,self.page,self.slot)
class FileSave:
    def __init__(self,name,sensitive=True): self.name=name;self.page=None;self.slot=False;self.confirm=True;self.sensitive=sensitive
    def get_sensitive(self): return self.sensitive
wanted=types.SimpleNamespace(clicked=[FileSave('1')],visit=lambda:[])
disabled=types.SimpleNamespace(clicked=[FileSave('2',False)],visit=lambda:[])
root=types.SimpleNamespace(visit=lambda:[wanted,disabled])
scene=types.SimpleNamespace(layers={'screens':[types.SimpleNamespace(displayable=root)]})
config=types.SimpleNamespace(screen_width=100,screen_height=100)
renpy=types.SimpleNamespace(store=types.SimpleNamespace(FileLoad=FileLoad),game=types.SimpleNamespace(context=lambda:types.SimpleNamespace(scene_lists=scene,current='body',return_stack=[])),display=types.SimpleNamespace(focus=types.SimpleNamespace(focus_list=[]),render=types.SimpleNamespace(focus_at_point=lambda x,y:types.SimpleNamespace(widget=wanted) if 20<x<35 and 20<y<35 else None)),get_screen=lambda name:None,get_widget=lambda *args:None)
`;
 const command=async script=>{const r=spawnSync('python3',['-c',setup+'scope={}\nexec('+JSON.stringify(script)+',globals(),scope)\nprint(json.dumps(scope["result"]))'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout)};
 const focus=await nativeFocus(command,true);assert.equal(focus.buttons.length,1);assert.equal(focus.buttons[0].slot,'1-1');assert.equal(focus.buttons[0].unboundedFocus,true);
 const point=await nativeClickablePoint(command,focus.buttons[0]);assert(point[0]>20&&point[0]<35&&point[1]>20&&point[1]<35);
 assert.equal(await nativeClickablePoint(async()=>({value:null}),focus.buttons[0]),null);
});

test('native click samples actual opaque target pixels and rejects an overlapping widget',async()=>{
 const setup="import types,json\ndef _test__slotname(name,page=None,slot=False): return '1-1'\nclass FileLoad:\n    def __init__(self): self.name='1';self.page=None;self.slot=False;self.confirm=True\n    def __call__(self): return _test__slotname(self.name,self.page,self.slot)\nwanted=types.SimpleNamespace(clicked=[FileLoad()])\nforeign=types.SimpleNamespace(clicked=[FileLoad()])\nf=types.SimpleNamespace(widget=wanted,x=0,y=0,w=100,h=100)\nrenpy=types.SimpleNamespace(store=types.SimpleNamespace(FileLoad=FileLoad),display=types.SimpleNamespace(focus=types.SimpleNamespace(focus_list=[f]),render=types.SimpleNamespace()))\n";
 async function run(overlaid){return nativeClickablePoint(async script=>{
  const code=setup+"renpy.display.render.focus_at_point=lambda x,y: types.SimpleNamespace(widget="+(overlaid?'foreign':'wanted')+") if 10<x<35 and 10<y<35 else None\nscope={}\nexec("+JSON.stringify(script)+",globals(),scope)\nprint(json.dumps(scope['result']))\n";
  const result=spawnSync('python3',['-c',code],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
 },{rect:[0,0,100,100],action:'FileLoad',screen:'None',page:'None',slot:'1-1',loadConfirm:true})}
 assert.deepEqual(await run(false),[25,25]);assert.equal(await run(true),null);
});

test('native click finds the only opaque timestamp below a transparent save thumbnail',async()=>{
 const setup="import types,json\ndef _test__slotname(name,page=None,slot=False): return '1-1'\nclass FileLoad:\n    def __init__(self): self.name='1';self.page=None;self.slot=False;self.confirm=True\n    def __call__(self): return _test__slotname(self.name,self.page,self.slot)\nwanted=types.SimpleNamespace(clicked=[FileLoad()])\nf=types.SimpleNamespace(widget=wanted,x=0,y=0,w=100,h=100)\nrenpy=types.SimpleNamespace(store=types.SimpleNamespace(FileLoad=FileLoad),display=types.SimpleNamespace(focus=types.SimpleNamespace(focus_list=[f]),render=types.SimpleNamespace(focus_at_point=lambda x,y:types.SimpleNamespace(widget=wanted) if 10<x<35 and 79<y<85 else None)))\n";
 const point=await nativeClickablePoint(async script=>{const r=spawnSync('python3',['-c',setup+'scope={}\nexec('+JSON.stringify(script)+',globals(),scope)\nprint(json.dumps(scope["result"]))'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout)},{rect:[0,0,100,100],action:'FileLoad',screen:'None',page:'None',slot:'1-1',loadConfirm:true});
 assert(point);assert(point[1]>79&&point[1]<85);
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

// 同一句对白的序列化形态变化不能作为剧情推进证据。
test('visible dialogue comparison rejects list versus native-say serialization changes',()=>{
 const a={text:"['你好']",visibleText:'你好',choice:false};
 assert.equal(nativeDialogueChanged(a,{text:'你好',visibleText:'你好',choice:false}),false);
 assert.equal(nativeDialogueChanged(a,{text:"['再见']",visibleText:'再见',choice:false}),true);
 assert.equal(nativeDialogueChanged(a,{text:'请选择',visibleText:'请选择',choice:true}),false);
});

test('keyboard confirmation occurs only after the exact native slot owns focus',async()=>{
 const keys=[],frame={locator:()=>({focus:async()=>{},press:async key=>keys.push(key)})};let calls=0;
 await activateNativeWithKeyboard(frame,async()=>({available:true,matched:++calls===2,rect:[0,0,20,20]}),{action:'FileLoad',slot:'1-1',rect:[100,0,20,20]});assert.deepEqual(keys,['ArrowRight','Enter']);
 keys.length=0;await assert.rejects(activateNativeWithKeyboard(frame,async()=>({available:false,matched:false}),{action:'FileLoad',slot:'1-1',rect:[0,0,20,20]}),/no keyboard focus/);assert.deepEqual(keys,[]);
});

test('native save API captures its required thumbnail before saving',async()=>{
 const calls=[];assert.equal(await saveNativeSlot(async script=>{calls.push(script);return calls.length===1?'1-1':true},1,{id:'renpy-v1286-1'}),'1-1');
 assert.match(calls[1],/renpy\.take_screenshot\([\s\S]*renpy\.save\(/);
 assert.equal(isNativeIntro({text:'本作品免费首发于青桔网，如果是购买所得，请给予卖家差评。'}),true);
 assert.equal(isNativeIntro({text:'感谢您的游玩，这是青桔移植组的第八个作品。'}),true);
 assert.equal(isNativeIntro({text:'我推开了房间的门。'}),false);
});

test('combined TTN menu opens only the exact manual native slot',()=>{
 const rows=[{action:'Show',screen:'saveload',slot:'1-2'},{action:'Show',screen:'saveload',slot:'1-q1'},{action:'Show',screen:'saveload',slot:'1-1'}];
 assert.equal(chooseNativePicker(rows,'1-1'),rows[2]);assert.equal(chooseNativePicker(rows,'2-1'),null);
});

test('Eden reads its active story text instead of the previous disclaimer',async()=>{
 const setup="import types,json\nspecial=types.SimpleNamespace(scope={'start_text':'那时的她——'},kwargs={})\nrenpy=types.SimpleNamespace(get_widget=lambda *a:None,get_screen=lambda name:special if name=='start_text' else None,store=types.SimpleNamespace(_last_say_what='青桔移植组说明'),game=types.SimpleNamespace(context=lambda:types.SimpleNamespace(current='body')))\n";
 const point=await nativePoint(async script=>{const r=spawnSync('python3',['-c',setup+'scope={}\nexec('+JSON.stringify(script)+',globals(),scope)\nprint(json.dumps(scope["result"]))'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout)},'renpy-v1286-1');
 assert.equal(point.visibleText,'那时的她——');assert.equal(isNativeIntro(point),false);
});

test('pointer focus requires the live exact target without requiring keyboard eligibility',async()=>{
 const setup="import types,json\ndef _test__slotname(name,page=None,slot=False): return '1-1'\nclass FileLoad:\n    def __init__(self):self.name='1';self.page=None;self.slot=False;self.confirm=True\n    def __call__(self):return _test__slotname(self.name,self.page,self.slot)\nwanted=types.SimpleNamespace(clicked=[FileLoad()],style=types.SimpleNamespace(keyboard_focus=False))\nf=types.SimpleNamespace(widget=wanted,x=0,y=0,w=100,h=100)\nrenpy=types.SimpleNamespace(store=types.SimpleNamespace(FileLoad=FileLoad),display=types.SimpleNamespace(focus=types.SimpleNamespace(focus_list=[f],get_focused=lambda:wanted)))\n";
 const command=async script=>{const r=spawnSync('python3',['-c',setup+'scope={}\nexec('+JSON.stringify(script)+',globals(),scope)\nprint(json.dumps(scope["result"]))'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout)};
 const target={action:'FileLoad',screen:'None',page:'None',slot:'1-1',loadConfirm:true};assert.equal((await nativeFocusState(command,target)).matched,true);assert.equal((await nativeFocusState(command,target,true)).available,false);
});

// 正文检查点排除已观察到的制作说明、教程、转场残留和纯标点。
test('body checkpoints reject observed credits and transition text',()=>{
 for(const text of ['后日谈剧本非二创，因此我们不能改变剧情走向，也无法决定流程长短。','我们将使用流传更广的汉化译名','后日谈的故事发生在菲莉娅独自开始旅行不久','现在，翻开这篇渺茫希望的日记吧。','温馨提示：从手机下面滑到上面，即可打开历史界面，正文开始。','.........'])assert.equal(isNativeBodyCheckpoint({text,visibleText:text,choice:false},'renpy-v50789-1'),false);
 assert.equal(isNativeBodyCheckpoint({text:'「欢迎光临。」',choice:false},'renpy-v8038-2'),true);
 assert.equal(isNativeBodyCheckpoint({text:'好帅…',choice:false,context:'game/script/Y/start.rpy'},'renpy-v44184-1'),true);
 assert.equal(isNativeBodyCheckpoint({text:'翻译声明',choice:false,context:'game/script/intro.rpy'},'renpy-v44184-1'),false);
});

// 鼠标按下会先更新原生焦点，不能用按下之前的悬停状态替代点击结果。
test('pointer press can focus a rendered target when hover focus is absent',async()=>{
 const events=[],canvas={focus:async()=>events.push('canvas-focus'),boundingBox:async()=>({x:0,y:0,width:100,height:100})},frame={locator:()=>canvas,evaluate:async()=>{}};
 const page={bringToFront:async()=>{},waitForTimeout:async()=>{},mouse:{move:async()=>{},down:async()=>events.push('down'),up:async()=>events.push('up')}};let calls=0;
 await clickNativeButton(page,frame,async()=>++calls===1?[50,50]:{matched:false,available:true}, {action:'ShowMenu',screen:'load',rect:[0,0,100,100]},[100,100]);
 assert.deepEqual(events,['canvas-focus','down','up']);assert.equal(calls,2);
});
