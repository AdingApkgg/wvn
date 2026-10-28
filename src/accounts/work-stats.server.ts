import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import type { PgDatabase } from "../database/postgres.ts";
import type {CatalogItem} from './library.server.ts';
import {AccountError} from './errors.server.ts';

export const READ_WINDOW_MS=30*60*1000;
export type WorkCounts={reads:number;likes:number;favorites:number};
const derive=(secret:string,value:string)=>createHmac('sha256',secret).update(value).digest('base64url');
export function issueReadVisitor(secret:string){const id=randomBytes(24).toString('base64url');return id+'.'+derive(secret,'wvn-reading-cookie:'+id)}
export function readVisitorKey(cookie:string|undefined,secret:string):string|null{
 if(!cookie||!/^[-\w]{32}\.[-\w]{43}$/.test(cookie))return null;
 const [id,signature]=cookie.split('.'),expected=derive(secret,'wvn-reading-cookie:'+id);
 if(!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;
 return createHmac('sha256',secret).update('wvn-reading-visitor:'+id).digest('hex');
}

export class WorkStatsStore{
 private works=new Map<string,CatalogItem>();
 constructor(private db:PgDatabase,catalog:CatalogItem[],private now=Date.now){
  this.setCatalog(catalog);
 }
 setCatalog(catalog:CatalogItem[]){
  const works=new Map<string,CatalogItem>(),versions=new Set<string>();
  for(const w of catalog){
   if(!/^(?:v|b)[1-9]\d*$/.test(w.id)||works.has(w.id)||!Array.isArray(w.versions))throw new AccountError(503,'CATALOG_UNAVAILABLE');
   for(const v of w.versions){if(versions.has(v.id))throw new AccountError(503,'CATALOG_UNAVAILABLE');versions.add(v.id)}
   if(w.versions.length)works.set(w.id,w);
  }
  this.works=works;
 }
 private work(id:string){const w=this.works.get(id);if(!w)throw new AccountError(404,'WORK_NOT_FOUND');return w}
 async counts(ids:string[]):Promise<Record<string,WorkCounts>>{
  if(!Array.isArray(ids)||ids.length<1||ids.length>100||new Set(ids).size!==ids.length)throw new AccountError(400,'STATS_INVALID');
  const result:Record<string,WorkCounts>={};
  const q=this.db.prepare("SELECT COALESCE((SELECT reads FROM wg_work_counts WHERE work_id=$1),0) AS reads,(SELECT count(*) FROM wg_work_reactions WHERE work_id=$2 AND kind='like') AS likes,(SELECT count(*) FROM wg_work_reactions WHERE work_id=$3 AND kind='favorite') AS favorites");
  for(const id of ids){this.work(id);const x=(await q.get(id,id,id))!;result[id]={reads:Number(x.reads),likes:Number(x.likes),favorites:Number(x.favorites)}}return result;
 }
 async read(workId:string,versionId:string,visitor:string){
  if(!this.work(workId).versions.some(v=>v.id===versionId))throw new AccountError(404,'VERSION_UNAVAILABLE');
  if(!/^[a-f0-9]{64}$/.test(visitor))throw new AccountError(400,'VISITOR_INVALID');
  const now=this.now();return (await this.db.transaction(async () => {
   const change=(await this.db.prepare("INSERT INTO wg_work_readers(work_id,visitor_key,last_at) VALUES ($1,$2,$3) ON CONFLICT(work_id,visitor_key) DO UPDATE SET last_at=excluded.last_at WHERE wg_work_readers.last_at<=$4").run(workId,visitor,now,now-READ_WINDOW_MS));
   if(change.changes)(await this.db.prepare("INSERT INTO wg_work_counts VALUES ($1,1) ON CONFLICT(work_id) DO UPDATE SET reads=wg_work_counts.reads+1").run(workId));
   (await this.db.prepare("DELETE FROM wg_work_readers WHERE last_at<$1").run(now-2*READ_WINDOW_MS));
   return {counted:!!change.changes,stats:(await this.counts([workId]))[workId]};
  }, { lock: 'wvn:read:' + workId + ':' + visitor }));
 }
 async mine(owner:string,workId:string){
  this.work(workId);const rows=(await this.db.prepare("SELECT kind FROM wg_work_reactions WHERE user_id=$1 AND work_id=$2").all(owner,workId));
  return {liked:rows.some(r=>r.kind==='like'),favorited:rows.some(r=>r.kind==='favorite')};
 }
 async react(owner:string,workId:string,kind:'like'|'favorite',enabled:boolean){
  this.work(workId);if(!['like','favorite'].includes(kind)||typeof enabled!=='boolean')throw new AccountError(400,'REACTION_INVALID');
  if(!(await this.db.prepare("SELECT 1 FROM \"user\" WHERE id=$1").get(owner)))throw new AccountError(401,'SIGN_IN_REQUIRED');
  if(enabled)(await this.db.prepare("INSERT INTO wg_work_reactions VALUES ($1,$2,$3,$4) ON CONFLICT(user_id,work_id,kind) DO NOTHING").run(owner,workId,kind,this.now()));
  else (await this.db.prepare("DELETE FROM wg_work_reactions WHERE user_id=$1 AND work_id=$2 AND kind=$3").run(owner,workId,kind));
  return {...(await this.mine(owner,workId)),stats:(await this.counts([workId]))[workId]};
 }
 async favorites(owner:string){return (await this.db.prepare("SELECT work_id FROM wg_work_reactions WHERE user_id=$1 AND kind='favorite' ORDER BY updated_at DESC,work_id").all(owner)).map(r=>String(r.work_id)).filter(id=>this.works.has(id))}
 async export(owner:string){return (await this.db.prepare("SELECT work_id,kind,updated_at FROM wg_work_reactions WHERE user_id=$1 ORDER BY work_id,kind").all(owner))}
 async allow(key:string,limit:number,windowMs:number){
  const now=this.now();(await this.db.prepare("DELETE FROM wg_work_stat_limits WHERE expires_at<=$1").run(now));
  const row=(await this.db.prepare("INSERT INTO wg_work_stat_limits VALUES ($1,1,$2) ON CONFLICT(key) DO UPDATE SET hits=wg_work_stat_limits.hits+1 RETURNING hits").get(key,now+windowMs))!;
  return Number(row.hits)<=limit;
 }
}
