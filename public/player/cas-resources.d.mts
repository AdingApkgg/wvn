export const casOrigin:'https://wg-b2.saop.cc';
export type CasRow={path:string;key:string;url:string;sha256:string;bytes:number;contentType:string};
export type CasManifest={schema:1;delivery:'cas';pilot:string;versionId:string;inventorySha256:string;resourceOrigin:string;resources:CasRow[];engineResources:{id:string;files:CasRow[]};ons?:any};
export type CasResolver={manifest:CasManifest;files:Map<string,CasRow>;engines:Map<string,CasRow>;urls:Map<string,CasRow>;base:string;path(value:string,relative?:string):string;row(value:string,relative?:string):CasRow;url(value:string,relative?:string):string};
export function createCasResolver(manifest:unknown,entry:{id:string;versionId:string},options?:{mainOrigin?:string;sharedEngine?:boolean}):CasResolver;
export function readCasManifest(response:Response,entry:{id:string;versionId:string},options?:{mainOrigin?:string;sharedEngine?:boolean}):Promise<CasManifest>;
export function rewriteCasCssUrls(text:string,path:string,resolver:CasResolver,options?:{ignoreImports?:boolean}):string;
export function rewriteCasCss(text:string,path:string,resolver:CasResolver,read:(path:string)=>Promise<string>,parents?:Set<string>):Promise<string>;
export function rewriteCasCssParts(parts:string[],path:string,resolver:CasResolver):string[];
export function rewriteCasCssPartsAsync(parts:string[],path:string,resolver:CasResolver,read:(path:string)=>Promise<string>):Promise<string[]>;

export function applyCasCssCompatibility(text: string, path: string, resolver: ReturnType<typeof createCasResolver>, actualSha: string): {text: string; applied?: {id: string; paths: string[]; source: string; sha256: string; tokens: number}};
