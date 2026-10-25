import {createHmac} from 'node:crypto';
import {getConnInfo} from '@hono/node-server/conninfo';
import {getCookie,setCookie} from 'hono/cookie';
import type {AccountService} from './service.server.ts';
import {AccountError} from './errors.server.ts';
import {catalogProvider} from './catalog-policy.server.ts';
import {issueReadVisitor,readVisitorKey} from './work-stats.server.ts';

export function mountWorkStats({app,config,workStats,player}:AccountService){
 const cookieName=(config.cookiePrefix??'__Host-wg')+'.reading';
 async function catalog(){
  try{const rows=await(config.catalogProvider?.()??(config.catalogOrigin?catalogProvider(config.catalogOrigin)():Promise.resolve(config.catalog??[])));workStats.setCatalog(rows);return rows}
  catch(e){if(e instanceof AccountError)throw e;throw new AccountError(503,'CATALOG_UNAVAILABLE')}
 }
 app.get('/api/public/work-stats',async c=>{await catalog();return c.json(workStats.counts((c.req.query('ids')??'').split(',')))});
 app.post('/api/public/works/:id/read',async c=>{
  const rows=await catalog(),id=c.req.param('id'),body=await c.req.json();
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='versionId')||typeof body.versionId!=='string')throw new AccountError(400,'STATS_INVALID');
  if(!rows.some(w=>w.id===id&&w.versions.some(v=>v.id===body.versionId)))throw new AccountError(404,'VERSION_UNAVAILABLE');
  let peer='';try{peer=getConnInfo(c).remote.address??''}catch{}
  // 回环代理不能被当作全站用户的共同身份；不信任访客自填的转发地址。
  if(peer&&!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)){
   const key=createHmac('sha256',config.secret).update('reading-peer:'+Math.floor(Date.now()/86400_000)+':'+peer).digest('hex');
   if(!workStats.allow('peer:'+key,1200,3600_000))throw new AccountError(429,'TRY_LATER');
  }
  const visitor=readVisitorKey(getCookie(c,cookieName),config.secret);
  if(!visitor){
   setCookie(c,cookieName,issueReadVisitor(config.secret),{httpOnly:true,secure:true,sameSite:'Lax',path:'/',maxAge:30*86400});
   return c.json({visitorRequired:true},202);
  }
  if(!workStats.allow('visitor:'+visitor,60,600_000))throw new AccountError(429,'TRY_LATER');
  return c.json(workStats.read(id,body.versionId,visitor));
 });
 app.get('/api/me/work-stats/:id',async c=>{const {session}=await player(c);await catalog();return c.json(workStats.mine(session.user.id,c.req.param('id')))});
 app.put('/api/me/work-stats/:id/:kind',async c=>{
  const {session}=await player(c);await catalog();const body=await c.req.json();
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='enabled'))throw new AccountError(400,'REACTION_INVALID');
  return c.json(workStats.react(session.user.id,c.req.param('id'),c.req.param('kind') as 'like'|'favorite',body.enabled));
 });
 app.get('/api/me/favorites',async c=>{const {session}=await player(c);await catalog();return c.json(workStats.favorites(session.user.id))});
}
