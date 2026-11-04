import {createCasResolver} from '../player/cas-resources.mjs';

export function makeResourcePlan(manifest,entry,{sharedEngine=true}={}){
 const resolver=createCasResolver(manifest,entry,{sharedEngine});
 const effective=new Map(resolver.files);if(sharedEngine)for(const [name,row] of resolver.engines)effective.set(name,row);
 const unique=new Map();
 for(const [path,row] of effective){
  const existing=unique.get(row.sha256);if(existing&&existing.bytes!==row.bytes)throw Error('Conflicting immutable resource size');
  if(existing)existing.paths.push(path);else unique.set(row.sha256,{...row,paths:[path]});
 }
 const rows=[...unique.values()],totalBytes=rows.reduce((n,r)=>n+r.bytes,0);if(!Number.isSafeInteger(totalBytes))throw Error('Resource plan exceeds size limit');
 return {id:[entry.id,entry.versionId,manifest.inventorySha256,manifest.engineResources.id,sharedEngine?'shared':'original'].join('/'),pilot:entry.id,versionId:entry.versionId,inventorySha256:manifest.inventorySha256,engineId:manifest.engineResources.id,rows,totalBytes};
}
