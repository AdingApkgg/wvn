import type {IncomingMessage,ServerResponse} from 'node:http';

// 资源下载与云存档正文允许后端确认；其余私人 API 保留短超时。
export function configureResourceTimeout(request:Pick<IncomingMessage,'url'|'method'>,response:Pick<ServerResponse,'setTimeout'>,options:{defaultMs:number;resourceMs:number;cloudMs?:number}={defaultMs:15_000,resourceMs:300_000,cloudMs:75_000}){
 const path=(request.url??'').split('?',1)[0],resource=(request.method==='GET'||request.method==='HEAD')&&['/__player/resource/','/__engines/resource/','/__ons/engine/','/__ons/resource/'].some(prefix=>path.startsWith(prefix));
 const cloud=request.method==='PUT'&&/^\/api\/me\/uploads\/[^/]+\/files\/[^/]+$/.test(path)
  ||request.method==='GET'&&/^\/api\/me\/save-profiles\/[^/]+\/revisions\/[^/]+\/files$/.test(path)
  ||request.method==='POST'&&/^\/api\/me\/uploads\/[^/]+\/commit$/.test(path);
 response.setTimeout(resource?options.resourceMs:cloud?(options.cloudMs??75_000):options.defaultMs);
}
