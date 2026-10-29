export const b2ResourceOrigin: 'https://wg-b2.saop.cc';
export const b2ReleasePrefix: '/releases/20261027-01/';
export function resourceOriginForManifest(value: unknown, origin: string): string;
export function runtimeResourceOrigin(base: string, entry: {id: string}, origin: string): string;
export function verifyDirectEngine(entry: {id:string;engineFiles:Record<string,string>},release: {id:string;files:{path:string;sha256:string}[]}|undefined,assetOrigin:string,options?:{fetcher?:typeof fetch;resolver?:{url(path:string):string}|null}): Promise<Map<string,Uint8Array>|undefined>;

export {createCasResolver,readCasManifest,rewriteCasCss,rewriteCasCssUrls} from './cas-resources.mjs';
