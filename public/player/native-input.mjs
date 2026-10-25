// This audited game expects a synchronous name prompt. Collect its value in the
// trusted player before launch, without granting modal or same-origin access.
export function nativeInputSpec(id){
 return id==='artemis-v25170-1'?{label:'主角名字',maxLength:32}:null;
}
export function validatePlayerName(value){
 if(typeof value!=='string'||!value.trim()||value.trim().length>32||/[\u0000-\u001f\u007f]/.test(value))throw Error('请输入 1–32 个字符的主角名字，不能包含换行或控制字符');
 return value.trim();
}
export function installNativeInput(win,id,input){
 if(!nativeInputSpec(id))return;
 const name=validatePlayerName(input?.playerName);
 Object.defineProperty(win,'prompt',{configurable:false,writable:false,value(message){
  if(message!=='请输入你的名字')throw Error('游戏请求了未经适配的输入，请保留页面并反馈');
  return name;
 }});
}
