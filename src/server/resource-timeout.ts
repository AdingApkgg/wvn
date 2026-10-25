import type {IncomingMessage,ServerResponse} from 'node:http';

// 大文件下载可能因浏览器编译或并行解包暂停读取；私人 API 仍保留原来的短超时。
export function configureResourceTimeout(request:Pick<IncomingMessage,'url'|'method'>,response:Pick<ServerResponse,'setTimeout'>,options={defaultMs:15_000,resourceMs:300_000}){
 const path=(request.url??'').split('?',1)[0],resource=(request.method==='GET'||request.method==='HEAD')&&['/__player/resource/','/__engines/resource/','/__ons/engine/','/__ons/resource/'].some(prefix=>path.startsWith(prefix));
 response.setTimeout(resource?options.resourceMs:options.defaultMs);
}
