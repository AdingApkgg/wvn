// 资格失效只暂停展示和音频，不销毁运行实例或改写存档。
export function installContentVisibility(scope){
 let visible=true;
 const contexts=new Set(),playing=new Set(),pausedLoops=new Set(),started=new Set();
 const media=()=>new Set([...started,...(scope.document?.querySelectorAll('audio,video')??[])]);
 for(const name of ['AudioContext','webkitAudioContext']){
  const Native=scope[name];if(typeof Native!=='function')continue;
  scope[name]=new Proxy(Native,{construct(target,args,newTarget){
   const context=Reflect.construct(target,args,newTarget),resume=context.resume.bind(context);
   context.resume=()=>visible?resume():Promise.resolve();contexts.add({context,resume});
   if(!visible)void context.suspend().catch(()=>{});return context;
  }});
 }
 const proto=scope.HTMLMediaElement?.prototype;
 if(proto?.play){const play=proto.play;proto.play=function(...args){
  if(!visible)return Promise.resolve();
  started.add(this);this.addEventListener?.('ended',()=>started.delete(this),{once:true});
  return play.apply(this,args);
 }}
 const pauseMedia=()=>{if(visible)return;for(const item of media()){if(!item.paused)playing.add(item);item.pause()}};
 const observer=scope.MutationObserver?new scope.MutationObserver(pauseMedia):null;
 observer?.observe(scope.document.documentElement,{childList:true,subtree:true});
 return {
  async setVisible(value){
   if(visible===value)return;visible=value;
   if(!visible){
    pauseMedia();
    await Promise.allSettled([...contexts].map(({context})=>context.suspend()));
    for(const loop of [scope.Module,scope.g_onsyuri_module])if(loop?.pauseMainLoop&&!pausedLoops.has(loop)){try{loop.pauseMainLoop();pausedLoops.add(loop)}catch{}}
   }else{
    await Promise.allSettled([...contexts].map(({context,resume})=>context.state==='suspended'?resume():Promise.resolve()));
    for(const item of playing)try{await item.play()}catch{}playing.clear();
    for(const loop of pausedLoops)try{loop.resumeMainLoop?.()}catch{}pausedLoops.clear();
   }
  },
  dispose(){observer?.disconnect()},
 };
}
