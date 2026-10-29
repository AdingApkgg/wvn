export const b2ResourceOrigin: 'https://wg-b2.saop.cc';
export const b2ReleasePrefix: '/releases/20261027-01/';
export function resourceOriginForManifest(value: unknown, origin: string): string;
export function runtimeResourceOrigin(base: string, entry: {id: string}, origin: string): string;
export function verifyDirectEngine(entry: {id:string;engineFiles:Record<string,string>;packageFiles?:Record<string,string>},release: {id:string;files:{path:string;sha256:string}[]}|undefined,assetOrigin:string,options?:{fetcher?:typeof fetch;resolver?:{row(path:string):{url:string;sha256:string;bytes:number}}|null}): Promise<Map<string,Uint8Array>|undefined>;
export function readPinnedResource(row:{url:string;sha256:string;bytes:number},options?:{fetcher?:typeof fetch;chunkBytes?:number;retries?:number;idleMs?:number;retryDelay?:(ms:number)=>Promise<void>}):Promise<Uint8Array>;
export {createCasResolver,readCasManifest,rewriteCasCss,rewriteCasCssUrls} from './cas-resources.mjs';
