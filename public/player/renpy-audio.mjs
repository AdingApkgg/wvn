// 固定共享 RenPy 的文件队列不含视频统计；只修正诊断读取，原生停止/清理逻辑继续执行。
const supportedRelease='renpy-5b572ebfa6248cac249cab61f698c967cac82b7d225da7515971b383d0f0a3cf';
const marker='// WVN: video statistics are optional for file-backed queues.';
const edits=['draw','file'].map(name=>({
 old:`const ${name}_fps = q.${name}_stats[1] > 1 ?`,
 fixed:`const ${name}_fps = q.${name}_stats?.[1] > 1 ?`,
}));
const count=(text,part)=>text.split(part).length-1;

export function prepareRenpyAudio(module,releaseId){
 if(releaseId!==supportedRelease)return false;
 const FS=module.FS??globalThis.FS,path='/renpy/common/_audio.js';
 if(!FS?.readFile||!FS?.writeFile)throw Error('RenPy runtime filesystem is unavailable');
 const source=FS.readFile(path,{encoding:'utf8'});
 if(source.includes(marker)){
  if(edits.every(e=>count(source,e.fixed)===1&&count(source,e.old)===0))return false;
  throw Error('RenPy audio source shape differs');
 }
 if(!source.includes('const DEBUG_OUT = false;')||!edits.every(e=>count(source,e.old)===1&&count(source,e.fixed)===0))throw Error('RenPy audio source shape differs');
 let fixed=source;for(const edit of edits)fixed=fixed.replace(edit.old,edit.fixed);
 FS.writeFile(path,marker+'\n'+fixed);
 return true;
}
