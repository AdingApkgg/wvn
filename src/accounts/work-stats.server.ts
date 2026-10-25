import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
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
 constructor(private db:DatabaseSync,catalog:CatalogItem[],private now=Date.now){
  this.setCatalog(catalog);
  db.exec(`CREATE TABLE IF NOT EXISTS wg_work_counts(work_id TEXT PRIMARY KEY,reads INTEGER NOT NULL DEFAULT 0 CHECK(reads>=0));
   CREATE TABLE IF NOT EXISTS wg_work_readers(work_id TEXT NOT NULL,visitor_key TEXT NOT NULL,last_at INTEGER NOT NULL,PRIMARY KEY(work_id,visitor_key));
   CREATE INDEX IF NOT EXISTS wg_work_readers_expiry ON wg_work_readers(last_at);
   CREATE TABLE IF NOT EXISTS wg_work_reactions(user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,work_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('like','favorite')),updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,work_id,kind));
   CREATE INDEX IF NOT EXISTS wg_work_reactions_counts ON wg_work_reactions(work_id,kind);
   CREATE TABLE IF NOT EXISTS wg_work_stat_limits(key TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires_at INTEGER NOT NULL);`);
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
 counts(ids:string[]):Record<string,WorkCounts>{
  if(!Array.isArray(ids)||ids.length<1||ids.length>100||new Set(ids).size!==ids.length)throw new AccountError(400,'STATS_INVALID');
  const result:Record<string,WorkCounts>={};
  const q=this.db.prepare("SELECT COALESCE((SELECT reads FROM wg_work_counts WHERE work_id=?),0) AS reads,(SELECT count(*) FROM wg_work_reactions WHERE work_id=? AND kind='like') AS likes,(SELECT count(*) FROM wg_work_reactions WHERE work_id=? AND kind='favorite') AS favorites");
  for(const id of ids){this.work(id);const x=q.get(id,id,id)!;result[id]={reads:Number(x.reads),likes:Number(x.likes),favorites:Number(x.favorites)}}return result;
 }
 read(workId:string,versionId:string,visitor:string){
  if(!this.work(workId).versions.some(v=>v.id===versionId))throw new AccountError(404,'VERSION_UNAVAILABLE');
  if(!/^[a-f0-9]{64}$/.test(visitor))throw new AccountError(400,'VISITOR_INVALID');
  const now=this.now();this.db.exec('BEGIN IMMEDIATE');
  try{
   const change=this.db.prepare('INSERT INTO wg_work_readers(work_id,visitor_key,last_at) VALUES (?,?,?) ON CONFLICT(work_id,visitor_key) DO UPDATE SET last_at=excluded.last_at WHERE wg_work_readers.last_at<=?').run(workId,visitor,now,now-READ_WINDOW_MS);
   if(change.changes)this.db.prepare('INSERT INTO wg_work_counts VALUES (?,1) ON CONFLICT(work_id) DO UPDATE SET reads=reads+1').run(workId);
   this.db.prepare('DELETE FROM wg_work_readers WHERE last_at<?').run(now-2*READ_WINDOW_MS);
   this.db.exec('COMMIT');return {counted:!!change.changes,stats:this.counts([workId])[workId]};
  }catch(e){this.db.exec('ROLLBACK');throw e}
 }
 mine(owner:string,workId:string){
  this.work(workId);const rows=this.db.prepare('SELECT kind FROM wg_work_reactions WHERE user_id=? AND work_id=?').all(owner,workId);
  return {liked:rows.some(r=>r.kind==='like'),favorited:rows.some(r=>r.kind==='favorite')};
 }
 react(owner:string,workId:string,kind:'like'|'favorite',enabled:boolean){
  this.work(workId);if(!['like','favorite'].includes(kind)||typeof enabled!=='boolean')throw new AccountError(400,'REACTION_INVALID');
  if(!this.db.prepare('SELECT 1 FROM "user" WHERE id=?').get(owner))throw new AccountError(401,'SIGN_IN_REQUIRED');
  if(enabled)this.db.prepare('INSERT INTO wg_work_reactions VALUES (?,?,?,?) ON CONFLICT(user_id,work_id,kind) DO NOTHING').run(owner,workId,kind,this.now());
  else this.db.prepare('DELETE FROM wg_work_reactions WHERE user_id=? AND work_id=? AND kind=?').run(owner,workId,kind);
  return {...this.mine(owner,workId),stats:this.counts([workId])[workId]};
 }
 favorites(owner:string){return this.db.prepare("SELECT work_id FROM wg_work_reactions WHERE user_id=? AND kind='favorite' ORDER BY updated_at DESC,work_id").all(owner).map(r=>String(r.work_id)).filter(id=>this.works.has(id))}
 export(owner:string){return this.db.prepare('SELECT work_id,kind,updated_at FROM wg_work_reactions WHERE user_id=? ORDER BY work_id,kind').all(owner)}
 allow(key:string,limit:number,windowMs:number){
  const now=this.now();this.db.prepare('DELETE FROM wg_work_stat_limits WHERE expires_at<=?').run(now);
  const row=this.db.prepare('INSERT INTO wg_work_stat_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').get(key,now+windowMs)!;
  return Number(row.hits)<=limit;
 }
}
