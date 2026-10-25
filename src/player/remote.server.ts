import {candidateForPlayer,type Candidate} from '../engines/candidate.ts';
import type { Hono } from 'hono';
import { pilots } from '../../public/ons/registry.mjs';
import { otherPlayers } from '../../public/player/registry.mjs';
import { engineHash } from '../ons/pilots.server.ts';
import {isIP} from 'node:net';

type ResourceProjection={id:string;path:'game.zip';upstream:string;sha256:string;bytes:number};
export function previewResourceProjections(document:unknown,deployment:string):Map<string,ResourceProjection>{
 if(deployment!=='preview')throw Error('Resource projection is restricted to preview');
 const doc=document as {schema?:number;entries?:ResourceProjection[]};
 if(doc?.schema!==1||!Array.isArray(doc.entries)||doc.entries.length>15)throw Error('Invalid resource projection');
 const rows=new Map<string,ResourceProjection>();
 for(const row of doc.entries){
  const target=new URL(row.upstream),ip=target.hostname.split('.').map(Number),key=`/__player/resource/${row.id}/game.zip`;
  if(!otherPlayers.some(p=>p.id===row.id&&p.runtimeKind==='RenPy')||row.path!=='game.zip'||!/^https?:$/.test(target.protocol)||target.username||target.password||target.pathname!=='/'||target.search||target.hash||!(isIP(target.hostname)===4&&ip[0]===100&&ip[1]>=64&&ip[1]<=127)||!/^([a-f0-9]{64})$/.test(row.sha256)||!Number.isSafeInteger(row.bytes)||row.bytes<=0||rows.has(key))throw Error('Invalid resource projection');
  rows.set(key,row);
 }
 return rows;
}

export function isPublicGamePath(path: string) {
  let decoded: string;
  try { decoded = decodeURIComponent(path); } catch { return false; }
  if (/[\\%\u0000-\u001f]/.test(decoded) || decoded.split('/').some((p, i, parts) => p === '..' || p === '.' || (p.startsWith('.') && !(i === parts.length - 1 && /^\.[^.]+\.ogg$/i.test(p)))) || /\.(?:env|db|sqlite|exe|py|ps1)$/i.test(decoded)) return false;
  const ons = /^\/__ons\/(runtime|manifest|data)\/([^/]+)(\/.*)?$/.exec(path);
  if (ons) return pilots.some(p => p.id === ons[2]) && (ons[1] === 'data' ? !!ons[3] && ons[3].length > 1 : !ons[3]);
  if (path === `/__ons/engine/${engineHash}/onsyuri.js` || path === `/__ons/engine/${engineHash}/onsyuri.wasm`) return true;
  const other = /^\/__player\/(runtime|resource)\/([^/]+)(\/.*)?$/.exec(path);
  return !!other && otherPlayers.some(p => p.id === other[2]) && (other[1] === 'resource' ? !!other[3] && other[3].length > 1 : !other[3]);
}

export function registerRemotePlayerResources(app: Hono, options: { upstream: string; fetcher?: typeof fetch; candidate?:(id:string)=>Candidate|null;projections?:Map<string,ResourceProjection> }) {
  const upstream = new URL(options.upstream);
  if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash) throw Error('Resource upstream must be an exact origin');
  const fetcher = options.fetcher ?? fetch;
  for (const prefix of ['/__ons/*', '/__player/*']) app.all(prefix, async c => {
    if (!isPublicGamePath(c.req.path)) return c.notFound();
    if (!['GET', 'HEAD'].includes(c.req.method)) return c.body(null, 405);
    const other=/^\/__player\/(?:runtime|resource)\/([^/]+)(?:\/(.*))?$/.exec(c.req.path),ons=/^\/__ons\/(?:runtime|manifest)\/([^/]+)$/.exec(c.req.path);
    const candidate=(other||ons)?(options.candidate??candidateForPlayer)((other??ons)![1]):null;
    // 旧资源地址始终属于旧引擎；候选通过父页握手固定不可变地址，避免在服务重启时混组。
    const projection=options.projections?.get(c.req.path);
    const target = new URL(projection?.upstream??upstream);
    target.pathname = new URL(c.req.url).pathname;
    const headers = new Headers({ 'accept-encoding': 'identity' });
    for (const key of ['range', 'if-range', 'if-none-match', 'if-modified-since']) {
      const value = c.req.header(key); if (value) headers.set(key, value);
    }
    try {
      const response = await fetcher(target, { method: c.req.method, headers, redirect: 'manual', signal: c.req.raw.signal });
      if(projection){
        const total=response.status===206?Number(response.headers.get('content-range')?.split('/')[1]):Number(response.headers.get('content-length'));
        if(![200,206,304,416].includes(response.status)||response.headers.get('etag')!=='"'+projection.sha256+'"'||[200,206].includes(response.status)&&total!==projection.bytes)throw Error('Projected archive differs');
      }
      const safe = new Headers();
      for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'etag', 'last-modified', 'access-control-allow-origin', 'cross-origin-resource-policy', 'cross-origin-embedder-policy', 'x-content-type-options', 'referrer-policy']) {
        const value = response.headers.get(key); if (value) safe.set(key, value);
      }
      const runtime=/^\/__ons\/runtime\/([^/]+)$/.exec(c.req.path),manifest=/^\/__ons\/manifest\/([^/]+)$/.exec(c.req.path);
      const policy = response.headers.get('content-security-policy');
      if (policy) {
        let scoped=policy.replaceAll('https://wg.saop.cc/', new URL(c.req.url).origin + '/');
        // 旧资源服务保持只读；仅为公共驱动补上精确脚本地址，不扩大游戏权限。
        if(c.req.path.startsWith('/__ons/runtime/')&&!scoped.includes('/player/emscripten.mjs'))scoped=scoped.replace('script-src ',`script-src ${new URL(c.req.url).origin}/player/emscripten.mjs `);
        if(candidate&&(runtime||other)){const prefix=new URL(c.req.url).origin+'/__engines/resource/'+candidate.release.id+'/';scoped=scoped.replace(/(script-src|connect-src) ([^;]*)/g,(_,directive,values)=>directive+' '+values+' '+prefix);safe.set('cache-control','no-store');}
        safe.set('content-security-policy',scoped);
      }
      const location = response.headers.get('location');
      if (location) {
        if (!location.startsWith('/') || location.startsWith('//') || !isPublicGamePath(location)) throw Error('Invalid resource redirect');
        safe.set('location', location);
      }
      if(candidate&&manifest&&response.status===200){if(c.req.method==='HEAD'){safe.delete('content-length');return new Response(null,{status:200,headers:safe});}const value=await response.json();value.engineRelease={id:candidate.release.id,files:candidate.release.files};safe.delete('content-length');safe.set('cache-control','no-store');return new Response(c.req.method==='HEAD'?null:JSON.stringify(value),{status:200,headers:safe});}
      return new Response(c.req.method === 'HEAD' ? null : response.body, { status: response.status, headers: safe });
    } catch {
      return c.json({ error: '游戏资源暂时不可用，请稍后重试' }, 502);
    }
  });
}
