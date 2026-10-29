import type {CasResolver} from './cas-resources.mjs';
export type WebgalResolver=CasResolver & {optionalMissing(value:string):boolean;missingMedia(value:string):boolean};
export function prepareWebgalResolver(resolver:CasResolver,options?:{fetcher?:typeof fetch}):Promise<WebgalResolver>;
export function installWebgalProbeFallback(win:Window & typeof globalThis,resolver:WebgalResolver):void;
