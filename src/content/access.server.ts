import type {ContentAccess} from './types.ts';
import {PUBLIC_CONTENT_ACCESS} from './policy.ts';

const key=Symbol.for('wvn.content-access');
type Bridge={origin:string|null;read:(request:Request)=>Promise<ContentAccess>};
const state=globalThis as typeof globalThis & {[name:symbol]:Bridge|undefined};
const requestKey=Symbol.for('wvn.content-access.requests.v1');
const requestState=globalThis as typeof globalThis & {[name:symbol]:WeakMap<Request,Promise<ContentAccess>>|undefined};
// tsx入口与Vite SSR分别加载模块，按同一Request共享可信缓存，不把资格写到请求头。
const requests=requestState[requestKey]??(requestState[requestKey]=new WeakMap<Request,Promise<ContentAccess>>());
export function contentGateEnabled(){return process.env.WG_CONTENT_GATE==='1'}
/** 仅由账号入口安装同进程可信读取器；浏览器提供的资格头不参与判定。 */
export function configureContentAccess(origin:string,read:Bridge['read']){
  if(new URL(origin).origin!==origin)throw Error('Exact content origin required');
  state[key]={origin,read};
}
/**
 * 公开入口与账号入口分进程部署时用这个：公开站的 origin 由部署决定（回环地址或反代域名），
 * 无法穷举，因此不校验 origin，改由读取器跨进程回源账号服务。
 */
export function configureContentAccessProxy(read:Bridge['read']){state[key]={origin:null,read}}
export function getContentAccess(request:Request):Promise<ContentAccess>{
  const previous=requests.get(request);if(previous)return previous;
  const bridge=state[key];
  let trusted=false;
  if(bridge){
    if(bridge.origin===null)trusted=true;
    else try{trusted=new URL(request.url).origin===bridge.origin}catch{trusted=false}
  }
  const result=trusted&&bridge?bridge.read(request):Promise.resolve({...PUBLIC_CONTENT_ACCESS});
  requests.set(request,result);return result;
}
export function cacheContentAccess(request:Request,access:Promise<ContentAccess>){requests.set(request,access)}
/** 仅供同进程子请求继承外层已认证结果；外部请求头无法写入此缓存。 */
export function cachedContentAccess(request:Request){return requests.get(request)}
