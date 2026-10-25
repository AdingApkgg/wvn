import assert from 'node:assert/strict';

export function chooseNativeStart({warning,buttons},{language=false}={}){
  const usable=buttons.filter(b=>Array.isArray(b.rect)&&b.rect.length===4&&b.rect.every(Number.isFinite)&&b.rect[2]>0&&b.rect[3]>0);
  const start=usable.find(b=>b.action==='Start');
  if(start)return {kind:'start',rect:start.rect};
  const languages=usable.filter(b=>b.action==='Language').sort((a,b)=>a.rect[1]-b.rect[1]);
  if(language&&languages.length>=2)return {kind:'language',rect:languages[0].rect};
  const hide=usable.filter(b=>b.action==='Hide'&&b.screen==='warning');
  return warning&&hide.length===1&&usable.some(b=>b.action==='Quit')?{kind:'warning',rect:hide[0].rect}:null;
}

export function chooseNativeChoice({choice,buttons}){
 if(!choice)return null;
 return buttons.filter(b=>['Return','ChoiceReturn','Jump'].includes(b.action)&&b.rect?.length===4&&b.rect.every(Number.isFinite)&&b.rect[2]>0&&b.rect[3]>0).sort((a,b)=>a.rect[1]-b.rect[1]||a.rect[0]-b.rect[0])[0]?.rect??null;
}
export function shouldAdvanceOpening(last,actions){
 return !last.warning&&last.buttons.length===0&&actions.some(a=>a==='warning'||a==='language')&&actions.filter(a=>a==='advance-opening').length<5;
}
export function chooseManualSavePage(buttons){return buttons.find(b=>b.action==='FilePage'&&b.page==='1')?.rect??null}
export function chooseNativeFileLoad(buttons,slot){return buttons.find(b=>b.action==='FileLoad'&&b.slot===slot)?.rect??null}
export function filesForNativeSlot(files,slot){return files.filter(file=>{const name=file.path.split('/').pop();return name===slot+'.save'||name.startsWith(slot+'-LT')&&/^\d+\.save$/.test(name.slice((slot+'-LT').length))})}
const nativeSlotFunction="renpy.store.FileLoad.__call__.__globals__[next(n for n in renpy.store.FileLoad.__call__.__code__.co_names if n.endswith('__slotname'))]";
export async function nativeSlotName(command,number){
 const slot=await command("result = ("+nativeSlotFunction+")("+number+", '1')");assert(typeof slot==='string'&&slot.length&& !slot.includes('/'));return slot;
}
export async function saveNativeSlot(command,number){const slot=await nativeSlotName(command,number);await command("renpy.save("+JSON.stringify(slot)+"); result=True");return slot}
export async function loadNativeSlot(page,frame,command,expectedText,id){
 const screen=id==='renpy-v50789-1'?'game_load':'load',slot=await nativeSlotName(command,1);
 const query=()=>command("result = (lambda _slot: {'size':(config.screen_width,config.screen_height),'mainMenu':renpy.get_screen('main_menu') is not None,'confirm':renpy.get_screen('confirm') is not None or renpy.get_screen('yesno_prompt') is not None,'buttons':[{'rect':(f.x,f.y,f.w,f.h),'action':type(a).__name__,'screen':str(getattr(a,'screen',None)),'loadConfirm':bool(getattr(a,'confirm',True)),'page':str(getattr(a,'page',None)),'slot':_slot(a.name,a.page,a.slot) if type(a).__name__=='FileLoad' else None} for f in renpy.display.focus.focus_list if f.x is not None and f.w and f.h for a in (getattr(f.widget,'clicked',None) if isinstance(getattr(f.widget,'clicked',None),(list,tuple)) else [getattr(f.widget,'clicked',None)])]})("+nativeSlotFunction+")");
 async function click(rect,size){const b=await frame.locator('#canvas').boundingBox();assert(b);const scale=Math.min(b.width/size[0],b.height/size[1]);await page.mouse.click(b.x+(b.width-size[0]*scale)/2+(rect[0]+rect[2]/2)*scale,b.y+(b.height-size[1]*scale)/2+(rect[1]+rect[3]/2)*scale,{delay:150});await page.waitForTimeout(1800)}
 let data,rect,openedMenu=false;
 for(let n=0;n<40;n++){
  data=await query();rect=chooseNativeFileLoad(data.buttons,slot);if(rect)break;
  const entry=data.buttons.find(b=>['ShowMenu','Show'].includes(b.action)&&b.screen===screen);
  if(entry){await click(entry.rect,data.size);continue}
  let manual=chooseManualSavePage(data.buttons);
  if(id==='renpy-v7738-1'&&!manual){const alternate=data.buttons.find(b=>b.action==='FilePage'&&b.page==='2');if(alternate){await click(alternate.rect,data.size);data=await query();manual=chooseManualSavePage(data.buttons)}}
  if(manual){await click(manual,data.size);continue}
  if(!openedMenu&&!data.mainMenu&&data.buttons.length){await page.getByRole('button',{name:'游戏菜单',exact:true}).click();openedMenu=true}
  await page.waitForTimeout(1000);
 }
 assert(rect,'Native FileLoad button missing for '+slot+': '+JSON.stringify(data));await click(rect,data.size);data=await query();
 if(data.confirm){const yes=chooseNativeFileLoad(data.buttons.filter(b=>b.loadConfirm===false),slot);assert(yes,'Exact native FileLoad confirmation missing');await click(yes,data.size)}
 for(let n=0;n<60;n++){const point=await nativePoint(command,id);if(point.text===expectedText)return point;await page.waitForTimeout(500)}
 throw Error('Native FileLoad did not restore expected text: '+JSON.stringify(await nativePoint(command,id)));
}
export async function nativePoint(command,id){
 const script=["_wvn_text = getattr(renpy.get_widget('say','what'),'text','')","_wvn_text = str(_wvn_text) if _wvn_text else ''","_wvn_native = getattr(renpy.store,'_last_say_what','')","_wvn_scene = []"];
 if(id==='renpy-v3144-1')script.push("_wvn_todo = [e.displayable for e in renpy.game.context().scene_lists.layers.get('master',[])]","_wvn_seen = set()","while _wvn_todo and len(_wvn_seen)<3000:","    _wvn_d = _wvn_todo.pop()","    if id(_wvn_d) in _wvn_seen: continue","    _wvn_seen.add(id(_wvn_d))","    if isinstance(_wvn_d,renpy.text.text.Text) and getattr(_wvn_d,'text',None): _wvn_scene.append(str(_wvn_d.text))","    _wvn_todo.extend(c for c in _wvn_d.visit() if c is not None)");
 script.push("_wvn_value = _wvn_text if _wvn_text and _wvn_text!='None' else str(_wvn_native or '')","result = {'text':_wvn_value or '\\n'.join(_wvn_scene),'source':'widget' if _wvn_text and _wvn_text!='None' else 'native-say' if _wvn_native else 'scene-text','choice':renpy.get_screen('choice') is not None,'context':str(renpy.game.context().current)}");const body=script.join('\n').replace(/\nresult = /,'\nreturn ');return command('def _wvn_capture_point():\n'+body.split('\n').map(l=>'    '+l).join('\n')+'\nresult = _wvn_capture_point()\ndel _wvn_capture_point');
}
export async function advanceNativeStory(page,frame,command){
 const data=await command("result = {'size':(config.screen_width,config.screen_height),'choice':renpy.get_screen('choice') is not None,'buttons':[{'rect':(f.x,f.y,f.w,f.h),'action':getattr(a,'__class__',type(None)).__name__} for f in renpy.display.focus.focus_list if f.x is not None and f.w and f.h for a in (getattr(f.widget,'clicked',None) if isinstance(getattr(f.widget,'clicked',None),(list,tuple)) else [getattr(f.widget,'clicked',None)])]}");
 const rect=chooseNativeChoice(data),b=await frame.locator('#canvas').boundingBox();assert(b);
 if(rect){const scale=Math.min(b.width/data.size[0],b.height/data.size[1]);await page.mouse.click(b.x+(b.width-data.size[0]*scale)/2+(rect[0]+rect[2]/2)*scale,b.y+(b.height-data.size[1]*scale)/2+(rect[1]+rect[3]/2)*scale,{delay:150})}
 else await page.mouse.click(b.x+b.width*.5,b.y+b.height*.7,{delay:100});
 await page.waitForTimeout(1100);
}
export async function inspectNativeDialogue(command){
 const body=["texts=[]","seen=set()","for layer,entries in renpy.game.context().scene_lists.layers.items():","    todo=[entry.displayable for entry in entries]","    while todo and len(seen)<6000:","        d=todo.pop()","        if id(d) in seen: continue","        seen.add(id(d))","        if isinstance(d,renpy.text.text.Text): texts.append({'layer':layer,'text':str(getattr(d,'text',''))[:1000]})","        try: children=d.visit() or []","        except Exception: children=[]","        todo.extend(c for c in children if c is not None)","node=renpy.game.script.namemap.get(renpy.game.context().current)","return {'texts':texts[:60],'nvl':str(getattr(renpy.store,'_nvl_list',None))[:4000],'node':{'kind':type(node).__name__,'file':str(getattr(node,'filename',None)),'line':getattr(node,'linenumber',None),'code':str(getattr(getattr(node,'code',None),'source',None))[:4000]}}"];
 return command('def _wvn_inspect_dialogue():\n'+body.map(l=>'    '+l).join('\n')+'\nresult=_wvn_inspect_dialogue()\ndel _wvn_inspect_dialogue');
}

// 只操作合成验收浏览器：按原生焦点坐标点击，不跳转剧情标签，也不自动接受未知弹窗。
export async function enterNativeStory(page,frame,command,id){
  const actions=[];let last;
  for(let n=0;n<90;n++){
    last=await command("result = {'size':(config.screen_width,config.screen_height),'warning':renpy.get_screen('warning') is not None,'text':str(getattr(renpy.get_widget('say','what'),'text','')),'buttons':[{'rect':(f.x,f.y,f.w,f.h),'action':getattr(a,'__class__',type(None)).__name__,'screen':getattr(a,'screen',None)} for f in renpy.display.focus.focus_list if f.x is not None and f.w and f.h for a in (getattr(f.widget,'clicked',None) if isinstance(getattr(f.widget,'clicked',None),(list,tuple)) else [getattr(f.widget,'clicked',None)])]}");
    const action=chooseNativeStart(last,{language:id==='renpy-v50789-1'});
    if(action){
      const b=await frame.locator('#canvas').boundingBox();assert(b);
      const [x,y,w,h]=action.rect,scale=Math.min(b.width/last.size[0],b.height/last.size[1]);
      await page.mouse.click(b.x+(b.width-last.size[0]*scale)/2+(x+w/2)*scale,b.y+(b.height-last.size[1]*scale)/2+(y+h/2)*scale,{delay:150});
      actions.push(action.kind);await page.waitForTimeout(1800);
      if(action.kind==='start'&&await command("result = renpy.get_screen('main_menu') is None"))return {actions};
    }else if(last.text&&last.text!=='None')return {actions,alreadyInStory:true};
    else if(shouldAdvanceOpening(last,actions)){
      // 部分移植在声明或语言选择后仍停在原生 pause；只在已确认前置操作且无可选动作时轻点推进。
      const b=await frame.locator('#canvas').boundingBox();assert(b);
      await page.mouse.click(b.x+b.width*.5,b.y+b.height*.7,{delay:150});actions.push('advance-opening');await page.waitForTimeout(2500);
    }else await page.waitForTimeout(1000);
  }
  throw Error('Native Start unavailable after audited opening: '+JSON.stringify(last));
}
