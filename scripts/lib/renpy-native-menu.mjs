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
export function isNativeIntro(point){const t=point.text??'';return t.includes('温馨提示')&&t.includes('正文开始')||t.includes('青桔移植组')||t.includes('本作品免费首发于')||t.includes('下载作品前，应当遵循当地法律')||t.includes('作品完全免费')||t.includes('购买所得')||t.includes('请立即给卖家差评')||t.includes('本作品由青桔移植组移植')||t.includes('STAFF')&&t.includes('程序')&&t.includes('美工')||t.includes('BUG反馈群')&&t.includes('移植组')||t.includes('当前游戏版本：')||t.includes('请确保您已通关《星之终途》本篇')||t.includes('本游戏是根据《星之终途》官方后日谈剧本制作的同人游戏')||t.includes('后日谈剧本非二创')||t.includes('我们将使用流传更广的汉化译名')||t.includes('后日谈的故事发生在')||t.includes('现在，翻开这篇渺茫希望的日记吧')}
export function isNativeBodyCheckpoint(point,id){return Boolean(point?.text&&point.text!=='None'&&!point.choice&&!isNativeIntro(point)&&/[\p{L}\p{N}]/u.test(point.visibleText??point.text)&&(!/^renpy-v44184-[1-4]$/.test(id)||point.context?.includes('/script/Y/')))}
export function chooseNativePicker(buttons,slot){return buttons.find(b=>b.action==='Show'&&b.screen==='saveload'&&b.slot===slot)??null}
export function nativeDialogueChanged(a,b){return Boolean(b?.text&&b.text!=='None'&&!b.choice&&(a.visibleText??a.text)!==(b.visibleText??b.text))}
export function isAuditedOpeningNotice(id,data){return /^renpy-v44184-[1-4]$/.test(id)&&!data.mainMenu&&!data.confirm&&data.buttons.length===0&&(data.text.includes('本作品免费首发于')&&data.text.includes('请务必支持正版')||data.text.includes('本移植仅供日语学习使用')&&data.text.includes('本组不负任何责任')||data.text.includes('本次移植增加了多语言框架')&&data.text.includes('切换为原语言')||/当前版本是v0\.9[0-3]?测试版/.test(data.text)&&data.text.includes('未完成的功能')||data.text.includes('STAFF')&&data.text.includes('移植')&&data.text.includes('翻译')||data.text.toLowerCase().includes('github')&&data.text.includes('翻译')&&data.text.includes('提交'))}
export const NATIVE_ACTIONS_PYTHON = "def _wvn_actions(value):\n    pending=[(value,0)]\n    while pending:\n        item,depth=pending.pop()\n        if depth>16: continue\n        if isinstance(item,(list,tuple)):\n            pending.extend((child,depth+1) for child in reversed(item))\n        elif item is not None: yield item";
export async function nativeFocus(command,includeSlots=false){
 const lines=[
  "def _wvn_collect_focus(_actions=_wvn_actions,_slot="+(includeSlots?nativeSlotFunction:'None')+"):",
  "    rows=[];seen=set()",
  "    splash=getattr(getattr(renpy.game,'script',None),'namemap',{}).get('splashscreen');opening=set()",
  "    if splash is not None: splash.get_children(lambda node,opening=opening:opening.add(node.name))",
  "    def add(widget,rect,unbounded=False):",
  "        for a in _actions(getattr(widget,'clicked',None)):",
  "            kind=type(a).__name__",
  "            if unbounded and (kind not in ('FileLoad','FileSave') or not a.get_sensitive()): continue",
  "            rows.append({'rect':rect,'unboundedFocus':unbounded,'action':kind,'screen':str(getattr(a,'screen',None)),'value':str(getattr(a,'value',None)),'loadConfirm':bool(getattr(a,'confirm',True)),'page':str(getattr(a,'page',None)),'slot':_slot(a.name,a.page,a.slot) if _slot is not None and kind in ('FileLoad','FileSave') else _slot(getattr(a,'kwargs',{}).get('id'),None) if _slot is not None and kind=='Show' and getattr(a,'screen',None)=='saveload' and isinstance(getattr(a,'kwargs',{}).get('id'),int) and not getattr(a,'kwargs',{}).get('quick',False) else None})",
  "    for f in renpy.display.focus.focus_list:",
  "        if f.x is not None and f.w and f.h: add(f.widget,(f.x,f.y,f.w,f.h));seen.add(id(f.widget))",
 ];
 if(includeSlots)lines.push(
  "    todo=[e.displayable for es in renpy.game.context().scene_lists.layers.values() for e in es]",
  "    while todo and len(seen)<6000:",
  "        d=todo.pop()",
  "        if id(d) in seen: continue",
  "        seen.add(id(d));add(d,(0,0,config.screen_width,config.screen_height),True)",
  "        try: children=d.visit() or []",
  "        except Exception: children=[]",
  "        todo.extend(c for c in children if c is not None)",
 );
 lines.push("    return {'inSplashscreen':renpy.game.context().current in opening or any(n in opening for n in renpy.game.context().return_stack),'size':(config.screen_width,config.screen_height),'mainMenu':renpy.get_screen('main_menu') is not None,'warning':renpy.get_screen('warning') is not None,'text':str(getattr(renpy.get_widget('say','what'),'text','')),'choice':renpy.get_screen('choice') is not None,'confirm':renpy.get_screen('confirm') is not None or renpy.get_screen('yesno_prompt') is not None,'buttons':rows}","result=_wvn_collect_focus()","del _wvn_collect_focus","del _wvn_actions");
 return command(NATIVE_ACTIONS_PYTHON+'\n'+lines.join('\n'));
}
const nativeSlotFunction="renpy.store.FileLoad.__call__.__globals__[next(n for n in renpy.store.FileLoad.__call__.__code__.co_names if n.endswith('__slotname'))]";
export async function nativeClickablePoint(command,button){
 const expected=[button.action,button.screen??'None',button.page??'None',button.slot??'None',button.loadConfirm?'True':'False'];
 const code=NATIVE_ACTIONS_PYTHON+'\ndef _wvn_click_point(_actions=_wvn_actions,_slot='+nativeSlotFunction+',expected='+JSON.stringify(expected)+',rect='+JSON.stringify(button.rect)+',unbounded='+(button.unboundedFocus?'True':'False')+'):\n'+[
  "    def matches(widget):",
  "        for a in _actions(getattr(widget,'clicked',None)):",
  "            kind=type(a).__name__",
  "            slot=_slot(a.name,a.page,a.slot) if kind in ('FileLoad','FileSave') else _slot(getattr(a,'kwargs',{}).get('id'),None) if _slot is not None and kind=='Show' and getattr(a,'screen',None)=='saveload' and isinstance(getattr(a,'kwargs',{}).get('id'),int) and not getattr(a,'kwargs',{}).get('quick',False) else None",
  "            actual=[kind,str(getattr(a,'screen',None)),str(getattr(a,'page',None)),str(slot),str(bool(getattr(a,'confirm',True)))]",
  "            if actual==expected: return True",
  "        return False",
  "    candidates=[f for f in renpy.display.focus.focus_list if f.x is not None and f.w and f.h and matches(f.widget)]",
  "    if not unbounded and candidates:",
  "        f=min(candidates,key=lambda f:sum((a-b)**2 for a,b in zip((f.x,f.y,f.w,f.h),rect)));rect=[f.x,f.y,f.w,f.h];widgets={id(f.widget)}",
  "    else: widgets=set()",
  "    if unbounded:",
  "        todo=[e.displayable for es in renpy.game.context().scene_lists.layers.values() for e in es];seen=set()",
  "        while todo and len(seen)<6000:",
  "            d=todo.pop()",
  "            if id(d) in seen: continue",
  "            seen.add(id(d))",
  "            if matches(d): widgets.add(id(d))",
  "            try: children=d.visit() or []",
  "            except Exception: children=[]",
  "            todo.extend(c for c in children if c is not None)",
  "    misses={}",
  "    def hit(x,y):",
  "        f=renpy.display.render.focus_at_point(x,y)",
  "        if f is not None and id(f.widget) not in widgets and len(misses)<8: misses[id(f.widget)]={'point':(x,y),'actions':[(type(a).__name__,str(getattr(a,'name',None)),str(getattr(a,'screen',None))) for a in _actions(getattr(f.widget,'clicked',None))]}",
  "        return f is not None and id(f.widget) in widgets",
  "    fallback=[]",
  "    fractions=(.5,.25,.75,.1,.9,.4,.6,.05,.95)+tuple(i/32.0 for i in range(1,32))",
  "    for fy in fractions:",
  "        for fx in fractions:",
  "            x=int(rect[0]+rect[2]*fx);y=int(rect[1]+rect[3]*fy)",
  "            if not hit(x,y): continue",
  "            if all(hit(x+dx,y+dy) for dx in (-1,0,1) for dy in (-1,0,1)): return [x,y]",
  "            fallback.append([x,y])",
  "    return fallback[0] if fallback else {'nativeHitDiagnostic':{'rect':rect,'widgets':list(widgets),'otherTargets':list(misses.values())}}",
 ].join('\n')+'\nresult=_wvn_click_point()\ndel _wvn_click_point\ndel _wvn_actions';
 const value=await command(code);if(value?.nativeHitDiagnostic)console.log(JSON.stringify(value));return Array.isArray(value)&&value.length===2&&value.every(Number.isFinite)?value:null;
}
function nativeFocusCommand(button,keyboard=true){
 const expected=[button.action,button.screen??'None',button.page??'None',button.slot??'None',button.loadConfirm?'True':'False'];
 const code=NATIVE_ACTIONS_PYTHON+'\ndef _wvn_focused(_actions=_wvn_actions,_slot='+nativeSlotFunction+',expected='+JSON.stringify(expected)+',keyboard='+(keyboard?'True':'False')+'):\n'+[
  "    def matches(d):",
  "        for a in _actions(getattr(d,'clicked',None)):",
  "            kind=type(a).__name__;slot=_slot(a.name,a.page,a.slot) if kind in ('FileLoad','FileSave') else _slot(getattr(a,'kwargs',{}).get('id'),None) if _slot is not None and kind=='Show' and getattr(a,'screen',None)=='saveload' and isinstance(getattr(a,'kwargs',{}).get('id'),int) and not getattr(a,'kwargs',{}).get('quick',False) else None",
  "            if [kind,str(getattr(a,'screen',None)),str(getattr(a,'page',None)),str(slot),str(bool(getattr(a,'confirm',True)))]==expected: return True",
  "        return False",
  "    focused=renpy.display.focus.get_focused();rect=None;available=False;matched=False",
  "    for f in renpy.display.focus.focus_list:",
  "        if f.x is None or not f.w or not f.h: continue",
  "        if f.widget is focused: rect=(f.x,f.y,f.w,f.h)",
  "        if matches(f.widget) and (not keyboard or f.widget.style.keyboard_focus): available=True;matched=matched or f.widget is focused",
  "    interface=getattr(renpy.display,'interface',None)",
  "    return {'matched':matched,'available':available,'rect':rect,'mouseFocused':getattr(interface,'mouse_focused',None),'keyboardFocused':getattr(interface,'keyboard_focused',None),'ignoreTouch':getattr(interface,'ignore_touch',None),'grabbed':renpy.display.focus.grab is not None if hasattr(renpy.display.focus,'grab') else None}",
 ].join('\n')+'\nresult=_wvn_focused()\ndel _wvn_focused\ndel _wvn_actions';
 return code;
}
export async function nativeFocusState(command,button,keyboard=false){return command(nativeFocusCommand(button,keyboard))}
export async function activateNativeWithKeyboard(frame,command,button){
 const code=nativeFocusCommand(button),canvas=frame.locator('#canvas'),keys=[],seen=new Set();await canvas.focus();
 for(let n=0;n<24;n++){
  const state=await command(code);assert(state.available,'Native target has no keyboard focus');
  if(state.matched){await canvas.press('Enter',{delay:100});return keys}
  const r=state.rect,dx=r?button.rect[0]+button.rect[2]/2-r[0]-r[2]/2:1,dy=r?button.rect[1]+button.rect[3]/2-r[1]-r[3]/2:0;
  const horizontal=dx>0?'ArrowRight':'ArrowLeft',vertical=dy>0?'ArrowDown':'ArrowUp';let key=Math.abs(dx)>Math.abs(dy)?horizontal:vertical;
  const signature=JSON.stringify([r,key]);if(seen.has(signature))key=[vertical,horizontal,'ArrowUp','ArrowLeft','ArrowRight','ArrowDown'][n%6];seen.add(signature);keys.push(key);await canvas.press(key,{delay:80});await new Promise(resolve=>setTimeout(resolve,120));
 }
 throw Error('Native keyboard navigation did not reach exact target '+JSON.stringify({action:button.action,slot:button.slot,screen:button.screen}));
}
export async function clickNativeButton(page,frame,command,button,size,wait=1800){
 assert(button,'Native button unavailable');const point=await nativeClickablePoint(command,button);if(!point&&['FileLoad','ShowMenu','Show'].includes(button.action)&&!button.unboundedFocus){const keys=await activateNativeWithKeyboard(frame,command,button);console.log(JSON.stringify({nativeClick:'keyboard-exact-slot',slot:button.slot,keys}));await page.waitForTimeout(wait);return}assert(point,'Native button has no clickable pixels: '+JSON.stringify(button));
 // 鼠标按下本身会更新原生焦点；悬停焦点只作诊断。必须先确认渲染命中，并在上层核验菜单/读档的实际结果。
 await page.bringToFront();await frame.evaluate(()=>window.focus());await frame.locator('#canvas').focus();
 const box=await frame.locator('#canvas').boundingBox();assert(box);const scale=Math.min(box.width/size[0],box.height/size[1]);
 await page.mouse.move(box.x+box.width*.03,box.y+box.height*.03);await page.waitForTimeout(200);
 await page.mouse.move(box.x+(box.width-size[0]*scale)/2+point[0]*scale,box.y+(box.height-size[1]*scale)/2+point[1]*scale);await page.waitForTimeout(900);
 const focused=await nativeFocusState(command,button);if(!focused.matched)console.log(JSON.stringify({nativeClick:'verified-render-target-without-hover-focus',action:button.action,slot:button.slot,point,focused}));
 await page.mouse.down();await page.waitForTimeout(250);await page.mouse.up();await page.waitForTimeout(wait);
}
export async function nativeSlotName(command,number){
 const slot=await command("result = ("+nativeSlotFunction+")("+number+", '1')");assert(typeof slot==='string'&&slot.length&& !slot.includes('/'));return slot;
}
export async function saveNativeSlot(command,number,gui){
 let slot=await nativeSlotName(command,number);
 if(!['renpy-v562-1','renpy-v7738-1'].includes(gui?.id)){await command("renpy.take_screenshot((config.thumbnail_width,config.thumbnail_height)); renpy.save("+JSON.stringify(slot)+"); result=True");return slot}
 // BGI 移植的保存菜单可能有自己的状态整理，验收走实际原生按钮。
 const {page,frame}=gui;
 const click=(button,size)=>clickNativeButton(page,frame,command,button,size,1500);
 let data,button,openedMenu=false;
 for(let n=0;n<25;n++){
  data=await nativeFocus(command,true);slot=await nativeSlotName(command,number);button=data.buttons.find(b=>b.action==='FileSave'&&b.slot===slot);if(button)break;
  const picker=gui.id==='renpy-v7738-1'?chooseNativePicker(data.buttons,slot):null;if(picker){await click(picker,data.size);continue}
  const entry=data.buttons.find(b=>['ShowMenu','Show'].includes(b.action)&&b.screen==='save');
  const manual=chooseManualSavePage(data.buttons);
  if(entry)await click(entry,data.size);else if(manual)await click(data.buttons.find(b=>b.rect===manual),data.size);else if(!openedMenu){await page.getByRole('button',{name:'游戏菜单',exact:true}).click();openedMenu=true;await page.waitForTimeout(1200)}else await page.waitForTimeout(500);
 }
 assert(button,'Native FileSave button missing for '+slot+': '+JSON.stringify(data));await click(button,data.size);
 data=await nativeFocus(command,true);
 if(data.confirm){const yes=data.buttons.find(b=>b.action==='FileSave'&&b.slot===slot&&!b.loadConfirm);assert(yes,'Exact native FileSave confirmation missing');await click(yes,data.size);data=await nativeFocus(command,true)}
 if(await command("result = renpy.get_screen('save') is not None")){
  const back=data.buttons.find(b=>b.action==='Return')??data.buttons.find(b=>b.action==='Hide'&&b.screen==='save');assert(back,'Native return from save menu unavailable');await click(back,data.size);
 }
 if(await command("result = renpy.get_screen('rmenu') is not None")){data=await nativeFocus(command,true);const back=data.buttons.find(b=>b.action==='Return');assert(back,'Native return from rmenu unavailable');await click(back,data.size)}
 assert(await command("result = renpy.get_screen('save') is None"),'Native save menu did not close');return slot;
}
export async function loadNativeSlot(page,frame,command,expectedText,id,expectedSlot){
 const screen=id==='renpy-v50789-1'?'game_load':'load',slot=expectedSlot??await nativeSlotName(command,1);
 const query=()=>nativeFocus(command,true);
 const click=(button,size)=>clickNativeButton(page,frame,command,button,size);
 let data,rect,openedMenu=false,openedCombined=false,openingNotices=0;
 for(let n=0;n<40;n++){
  data=await query();rect=chooseNativeFileLoad(data.buttons,slot);if(rect)break;
  if(openingNotices<6&&isAuditedOpeningNotice(id,data)){
   await frame.locator('#canvas').press('Space',{delay:150});openingNotices++;await page.waitForTimeout(1800);continue;
  }
  const picker=id==='renpy-v7738-1'?chooseNativePicker(data.buttons,slot):null;if(picker){await click(picker,data.size);continue}
  const entry=data.buttons.find(b=>['ShowMenu','Show'].includes(b.action)&&b.screen===screen);
  if(entry){await click(entry,data.size);continue}
  if(id==='renpy-v7738-1'&&!openedCombined){
   const combined=data.buttons.find(b=>b.action==='ShowMenu'&&b.screen==='save');
   if(combined){await click(combined,data.size);openedCombined=true;continue}
  }
  let manual=chooseManualSavePage(data.buttons);
  if(id==='renpy-v7738-1'&&!manual){const alternate=data.buttons.find(b=>b.action==='FilePage'&&b.page==='2');if(alternate){await click(alternate,data.size);data=await query();manual=chooseManualSavePage(data.buttons)}}
  if(manual){await click(data.buttons.find(b=>b.rect===manual),data.size);continue}
  if(!openedMenu&&!data.mainMenu&&data.buttons.length){await page.getByRole('button',{name:'游戏菜单',exact:true}).click();openedMenu=true}
  await page.waitForTimeout(1000);
 }
 assert(rect,'Native FileLoad button missing for '+slot+': '+JSON.stringify(data));await click(data.buttons.find(b=>b.rect===rect),data.size);data=await query();
 if(data.confirm){const yes=chooseNativeFileLoad(data.buttons.filter(b=>b.loadConfirm===false),slot);assert(yes,'Exact native FileLoad confirmation missing');await click(data.buttons.find(b=>b.rect===yes),data.size)}
 const waits=['renpy-v562-1','renpy-v3144-1'].includes(id)?360:60;
 for(let n=0;n<waits;n++){const point=await nativePoint(command,id);if(point.text===expectedText)return point;await page.waitForTimeout(500)}
 throw Error('Native FileLoad did not restore expected text: '+JSON.stringify(await nativePoint(command,id)));
}
export async function nativePoint(command,id){
 const special=id==='renpy-v1286-1'?"_wvn_special = renpy.get_screen('start_text')\nif _wvn_special is not None: _wvn_raw = _wvn_special.scope.get('start_text',getattr(_wvn_special,'kwargs',{}).get('start_text',_wvn_raw))":'';
 const script=["_wvn_raw = getattr(renpy.get_widget('say','what'),'text','')",...(special?special.split('\n'):[]),"_wvn_visible = ''.join(str(v) for v in _wvn_raw) if hasattr(_wvn_raw,'__iter__') and not isinstance(_wvn_raw,str) else str(_wvn_raw or '')","_wvn_text = _wvn_raw","if len(_wvn_visible)<32768 and _wvn_visible.startswith('[') and _wvn_visible.endswith(']'):","    try:","        import ast as _wvn_ast","        _wvn_parts = _wvn_ast.literal_eval(_wvn_visible)","        if isinstance(_wvn_parts,(list,tuple)) and all(isinstance(v,str) for v in _wvn_parts): _wvn_visible = ''.join(_wvn_parts)","    except (ValueError,SyntaxError): pass","_wvn_text = str(_wvn_text) if _wvn_text else ''","_wvn_native = getattr(renpy.store,'_last_say_what','')","_wvn_scene = []"];
 if(id==='renpy-v3144-1')script.push("_wvn_todo = [e.displayable for e in renpy.game.context().scene_lists.layers.get('master',[])]","_wvn_seen = set()","while _wvn_todo and len(_wvn_seen)<3000:","    _wvn_d = _wvn_todo.pop()","    if id(_wvn_d) in _wvn_seen: continue","    _wvn_seen.add(id(_wvn_d))","    if isinstance(_wvn_d,renpy.text.text.Text) and getattr(_wvn_d,'text',None): _wvn_scene.append(str(_wvn_d.text))","    _wvn_todo.extend(c for c in _wvn_d.visit() if c is not None)");
 script.push("_wvn_value = _wvn_text if _wvn_text and _wvn_text!='None' else str(_wvn_native or '')","result = {'text':_wvn_value or '\\n'.join(_wvn_scene),'textType':type(_wvn_raw).__name__,'visibleText':_wvn_visible or str(_wvn_native or '') or '\\n'.join(_wvn_scene),'source':'widget' if _wvn_text and _wvn_text!='None' else 'native-say' if _wvn_native else 'scene-text','choice':renpy.get_screen('choice') is not None,'context':str(renpy.game.context().current)}");const body=script.join('\n').replace(/\nresult = /,'\nreturn ');return command('def _wvn_capture_point():\n'+body.split('\n').map(l=>'    '+l).join('\n')+'\nresult = _wvn_capture_point()\ndel _wvn_capture_point');
}
export async function advanceNativeStory(page,frame,command){
 const data=await nativeFocus(command);
 const rect=chooseNativeChoice(data),b=await frame.locator('#canvas').boundingBox();assert(b);
 if(rect){const scale=Math.min(b.width/data.size[0],b.height/data.size[1]);await page.mouse.click(b.x+(b.width-data.size[0]*scale)/2+(rect[0]+rect[2]/2)*scale,b.y+(b.height-data.size[1]*scale)/2+(rect[1]+rect[3]/2)*scale,{delay:150})}
 else await page.mouse.click(b.x+b.width*.5,b.y+b.height*.7,{delay:100});
 await page.waitForTimeout(1100);
}
export async function inspectNativeDialogue(command){
 const body=["texts=[]","seen=set()","for layer,entries in renpy.game.context().scene_lists.layers.items():","    todo=[(entry.displayable,str(getattr(entry.displayable,'screen_name',None)),str(getattr(entry,'tag',None))) for entry in entries]","    while todo and len(seen)<6000:","        d,screen,tag=todo.pop()","        if id(d) in seen: continue","        seen.add(id(d))","        if isinstance(d,renpy.text.text.Text): texts.append({'layer':layer,'screen':screen,'tag':tag,'text':str(getattr(d,'text',''))[:1000]})","        try: children=d.visit() or []","        except Exception: children=[]","        todo.extend((c,screen,tag) for c in children if c is not None)","node=renpy.game.script.namemap.get(renpy.game.context().current)","return {'texts':texts[:60],'nvl':str(getattr(renpy.store,'_nvl_list',None))[:4000],'node':{'kind':type(node).__name__,'file':str(getattr(node,'filename',None)),'line':getattr(node,'linenumber',None),'code':str(getattr(getattr(node,'code',None),'source',None))[:4000]}}"];
 return command('def _wvn_inspect_dialogue():\n'+body.map(l=>'    '+l).join('\n')+'\nresult=_wvn_inspect_dialogue()\ndel _wvn_inspect_dialogue');
}

// 只操作合成验收浏览器：按原生焦点坐标点击，不跳转剧情标签，也不自动接受未知弹窗。
export async function enterNativeStory(page,frame,command,id){
  const actions=[];let last;
  for(let n=0;n<90;n++){
    last=await nativeFocus(command);
    if(last.inSplashscreen&&last.text&&last.text!=='None'&&!last.confirm&&!last.choice&&!last.buttons.length){
      await frame.locator('#canvas').press('Space',{delay:150});actions.push('splashscreen-say');await page.waitForTimeout(1800);continue;
    }
    if(isAuditedOpeningNotice(id,last)&&actions.filter(a=>a==='opening-notice').length<6){
      await frame.locator('#canvas').press('Space',{delay:150});actions.push('opening-notice');await page.waitForTimeout(1800);continue;
    }
    const action=chooseNativeStart(last,{language:id==='renpy-v50789-1'});
    if(action){
      const b=await frame.locator('#canvas').boundingBox();assert(b);
      const [x,y,w,h]=action.rect,scale=Math.min(b.width/last.size[0],b.height/last.size[1]);
      await page.mouse.click(b.x+(b.width-last.size[0]*scale)/2+(x+w/2)*scale,b.y+(b.height-last.size[1]*scale)/2+(y+h/2)*scale,{delay:150});
      actions.push(action.kind);await page.waitForTimeout(1800);
      if(action.kind==='start'&&await command("result = renpy.get_screen('main_menu') is None"))return {actions};
    }else if(last.text&&last.text!=='None'&&!last.inSplashscreen&&['renpy-v562-1','renpy-v562-2','renpy-v3144-1','renpy-v7738-1'].includes(id))return {actions,alreadyInStory:true};
    else if(shouldAdvanceOpening(last,actions)){
      // 部分移植在声明或语言选择后仍停在原生 pause；只在已确认前置操作且无可选动作时轻点推进。
      const b=await frame.locator('#canvas').boundingBox();assert(b);
      await page.mouse.click(b.x+b.width*.5,b.y+b.height*.7,{delay:150});actions.push('advance-opening');await page.waitForTimeout(2500);
    }else await page.waitForTimeout(1000);
  }
  throw Error('Native Start unavailable after audited opening: '+JSON.stringify(last));
}
