// 原生全屏与页面铺满共用同一运行区，始终保留游戏iframe和本机存档通道。
export function createReaderFullscreen(surface,{document=surface.ownerDocument,window=document.defaultView,onChange=()=>{}}={}){
 let mode='none',closed=false,pending=false,saved;
 const current=()=>document.fullscreenElement??document.webkitFullscreenElement;
 const owns=()=>current()&&(current()===surface||surface.contains(current()));
 function change(value){if(mode===value)return;mode=value;onChange(value)}
 function leavePage(){if(!saved)return;surface.classList.remove('reader-page-fullscreen');for(const [name,value]of Object.entries(saved.body))document.body.style[name]=value;document.documentElement.style.overflow=saved.html;window.scrollTo(saved.x,saved.y);saved=undefined}
 function page(){const body={};for(const key of ['overflow','position','top','left','width'])body[key]=document.body.style[key]??'';saved={body,html:document.documentElement.style.overflow??'',x:window.scrollX,y:window.scrollY};Object.assign(document.body.style,{overflow:'hidden',position:'fixed',top:-saved.y+'px',left:-saved.x+'px',width:'100%'});document.documentElement.style.overflow='hidden';surface.classList.add('reader-page-fullscreen');change('page')}
 const nativeExit=()=>{const exit=document.exitFullscreen??document.webkitExitFullscreen;return owns()&&exit?Promise.resolve(exit.call(document)):Promise.resolve()};
 async function exit(){leavePage();try{await nativeExit()}finally{change('none')}}
 const sync=()=>{if(owns()){leavePage();change('native')}else if(mode==='native')change('none')};
 const escape=event=>{if(mode==='page'&&event.key==='Escape'){event.preventDefault();void exit()}};
 const hide=()=>{void exit().catch(()=>{})};
 document.addEventListener('fullscreenchange',sync);document.addEventListener('webkitfullscreenchange',sync);document.addEventListener('keydown',escape);window.addEventListener('pagehide',hide);
 return {get mode(){return mode},exit,async toggle(){if(closed||pending)return;pending=true;try{if(mode!=='none'){await exit();return}const enter=surface.requestFullscreen??surface.webkitRequestFullscreen,enabled=document.fullscreenEnabled??document.webkitFullscreenEnabled;if(typeof enter==='function'&&enabled!==false){try{await enter.call(surface);if(closed){await nativeExit();return}if(owns()){change('native');return}}catch{/* 浏览器拒绝/不支持元素全屏时，使用可退出的页面铺满。 */}}if(!closed)page()}finally{pending=false}},close(){if(closed)return;closed=true;leavePage();void nativeExit().catch(()=>{});change('none');document.removeEventListener('fullscreenchange',sync);document.removeEventListener('webkitfullscreenchange',sync);document.removeEventListener('keydown',escape);window.removeEventListener('pagehide',hide)}};
}
