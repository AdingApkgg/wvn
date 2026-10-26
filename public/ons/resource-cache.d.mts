export type CacheStats={available:boolean;hits:number;downloads:number;preloaded:number;bytes:number;maxBytes:number;prefetching:boolean};
export type ResourcePlan={pilot:string;versionId:string;revision:string;namespace:string;resources:Map<string,{key:string;namespace:string;url:string;path?:string;kind:string;lazy?:boolean;sha256?:string}>;candidates:string[];manifest:any};
export type CacheRow={key:string;namespace:string;size:number;sha256:string;data:Uint8Array;accessedAt:number;expiresAt:number};
export type ResourceStore={get(key:string):Promise<CacheRow|null>;list():Promise<Omit<CacheRow,'data'>[]>;put(row:CacheRow):Promise<unknown>;putBounded?(row:CacheRow,maxBytes:number):Promise<number>;remove(keys:string[]):Promise<unknown>;touch(key:string,time:number):Promise<unknown>;close():void};
export type ResourceSession={load(key:string,onProgress?:(value:{loaded:number;total:number;source:'network'})=>void):Promise<{data?:Uint8Array;source?:string;direct?:boolean}>;startPrefetch():void;whenIdle():Promise<void>;stats():CacheStats;close():void};
export function createOnsResourcePlan(pilot:{id:string;versionId:string;engine:string},manifest:unknown,origin:string,release?:unknown):Promise<ResourcePlan>;
export function openResourceCacheStore(idb?:IDBFactory):Promise<ResourceStore>;
export function createOnsResourceSession(options:{plan:ResourcePlan;store?:ResourceStore|null;fetcher?:typeof fetch;now?:()=>number;maxBytes?:number;maxFileBytes?:number;ttl?:number;prefetchFiles?:number;prefetchBytes?:number;idleMs?:number;onStats?:(stats:CacheStats)=>void}):ResourceSession;
export function clearOnsResourceCache(pilot:string):Promise<void>;
