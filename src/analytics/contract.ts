export function canonicalAnalyticsPath(value:unknown):string|null{
 if(typeof value!=='string'||value.length>2048||!value.startsWith('/')||value.startsWith('//'))return null;
 const path=value.split(/[?#]/,1)[0];
 return path==='/'||/^\/b?[1-9]\d*(?:\/[1-9]\d*)?\/$/.test(path)?path:null;
}
type Payload={website:string;hostname:string;url:string;title:string;referrer:string;language?:string;screen?:string;name?:string;data?:{workId:string;enabled?:boolean}};
export function analyticsPayload(input:unknown,websiteId:string,hostname:string):{type:'event';payload:Payload}|null{
 if(!input||typeof input!=='object'||(input as {type?:unknown}).type!=='event')return null;
 const raw=(input as {payload?:unknown}).payload;if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const p=raw as Record<string,unknown>,path=canonicalAnalyticsPath(p.url);if(p.website!==websiteId||!path)return null;
 const payload:Payload={website:websiteId,hostname,url:path,title:'WVN',referrer:''};
 if(typeof p.language==='string'&&/^[a-zA-Z0-9-]{1,35}$/.test(p.language))payload.language=p.language;
 if(typeof p.screen==='string'&&/^\d{1,5}x\d{1,5}$/.test(p.screen))payload.screen=p.screen;
 if(p.name!==undefined){
  if(typeof p.name!=='string'||!['reading_start','like','favorite'].includes(p.name))return null;
  const match=/^\/(b?)([1-9]\d*)\//.exec(path);if(!match)return null;
  payload.name=p.name;payload.data={workId:(match[1]?'b':'v')+match[2]};
  if(p.name!=='reading_start'){
   const enabled=(p.data as {enabled?:unknown}|undefined)?.enabled;if(typeof enabled!=='boolean')return null;payload.data.enabled=enabled;
  }
 }
 return {type:'event',payload};
}
