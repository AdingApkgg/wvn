import type {ContentAccess} from './types.ts';
import {PUBLIC_CONTENT_ACCESS} from './policy.ts';

const key=Symbol.for('wvn.content-access');
type Bridge={origin:string;read:(request:Request)=>Promise<ContentAccess>};
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
export function getContentAccess(request:Request):Promise<ContentAccess>{
  const previous=requests.get(request);if(previous)return previous;
  const bridge=state[key];
  const result=bridge&&new URL(request.url).origin===bridge.origin?bridge.read(request):Promise.resolve({...PUBLIC_CONTENT_ACCESS});
  requests.set(request,result);return result;
}
export function cacheContentAccess(request:Request,access:Promise<ContentAccess>){requests.set(request,access)}
/** 仅供同进程子请求继承外层已认证结果；外部请求头无法写入此缓存。 */
export function cachedContentAccess(request:Request){return requests.get(request)}
