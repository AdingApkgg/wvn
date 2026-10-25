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
 return buttons.filter(b=>['Return','Jump'].includes(b.action)&&b.rect?.length===4&&b.rect.every(Number.isFinite)&&b.rect[2]>0&&b.rect[3]>0).sort((a,b)=>a.rect[1]-b.rect[1]||a.rect[0]-b.rect[0])[0]?.rect??null;
}
export async function nativePoint(command){
 return command("_wvn_text = getattr(renpy.get_widget('say','what'),'text','')\n_wvn_text = str(_wvn_text) if _wvn_text else ''\n_wvn_native = getattr(renpy.store,'_last_say_what','')\nresult = {'text':_wvn_text if _wvn_text and _wvn_text!='None' else str(_wvn_native or ''),'source':'widget' if _wvn_text and _wvn_text!='None' else 'native-say','choice':renpy.get_screen('choice') is not None,'context':str(renpy.game.context().current)}");
}
export async function advanceNativeStory(page,frame,command){
 const data=await command("result = {'size':(config.screen_width,config.screen_height),'choice':renpy.get_screen('choice') is not None,'buttons':[{'rect':(f.x,f.y,f.w,f.h),'action':getattr(a,'__class__',type(None)).__name__} for f in renpy.display.focus.focus_list if f.x is not None and f.w and f.h for a in (getattr(f.widget,'clicked',None) if isinstance(getattr(f.widget,'clicked',None),(list,tuple)) else [getattr(f.widget,'clicked',None)])]}");
 const rect=chooseNativeChoice(data),b=await frame.locator('#canvas').boundingBox();assert(b);
 if(rect){const scale=Math.min(b.width/data.size[0],b.height/data.size[1]);await page.mouse.click(b.x+(b.width-data.size[0]*scale)/2+(rect[0]+rect[2]/2)*scale,b.y+(b.height-data.size[1]*scale)/2+(rect[1]+rect[3]/2)*scale,{delay:150})}
 else await page.mouse.click(b.x+b.width*.5,b.y+b.height*.7,{delay:100});
 await page.waitForTimeout(1100);
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
      if(action.kind==='start')return {actions};
    }else if(last.text&&last.text!=='None')return {actions,alreadyInStory:true};
    else if(!last.warning&&last.buttons.length===0&&actions.includes('warning')&&actions.filter(a=>a==='advance-opening').length<5){
      // 部分移植在 Hide(warning) 后仍停在原生 pause；只在已确认声明页且没有可选动作时轻点推进。
      const b=await frame.locator('#canvas').boundingBox();assert(b);
      await page.mouse.click(b.x+b.width*.5,b.y+b.height*.7,{delay:150});actions.push('advance-opening');await page.waitForTimeout(2500);
    }else await page.waitForTimeout(1000);
  }
  throw Error('Native Start unavailable after audited opening: '+JSON.stringify(last));
}
