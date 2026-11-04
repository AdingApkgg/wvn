// 账号 Cookie 不按端口隔离，缓存必须使用另一个主机名。
export function resourceCacheOrigin(value:string|undefined,parentOrigin:string):string|null{
 if(!value)return null;
 let cache:URL,parent:URL;try{cache=new URL(value);parent=new URL(parentOrigin)}catch{throw Error('WG_RESOURCE_CACHE_ORIGIN must be an independent HTTPS origin')}
 if(cache.protocol!=='https:'||cache.origin!==value||cache.username||cache.password||cache.hostname===parent.hostname)throw Error('WG_RESOURCE_CACHE_ORIGIN must be an independent HTTPS origin');
 return cache.origin;
}
