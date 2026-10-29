import assets from './public-assets.mjs';
const prefix = "/releases/20261027-01/";
const host = "wg-b2.saop.cc";
const origin = "https://f003.backblazeb2.com/file/web-visual-novel";
const namespace = 'b2/web-visual-novel/snapshot-20261028';
const metadataLimit = 8192;
const metadataTimeout = 5000;
const cacheLimit = 32 * 1024 ** 2;
const forwardedHeaders = ["range", "if-range", "if-none-match", "if-modified-since"];

function result(response, method, cacheStatus, objectPath, metadata) {
  const headers = new Headers(response.headers);
  const ext=objectPath.split('.').at(-1).toLowerCase(),mime={js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',wasm:'application/wasm',css:'text/css; charset=utf-8',json:'application/json',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',mp4:'video/mp4',ogg:'audio/ogg',ogv:'video/ogg',mp3:'audio/mpeg',wav:'audio/wav',ttf:'font/ttf',otf:'font/otf',woff:'font/woff',woff2:'font/woff2'};
  headers.set('Content-Type',mime[ext] ?? metadata.contentType);
  headers.set('Access-Control-Expose-Headers','Content-Length, Content-Range, Accept-Ranges, ETag, x-bz-content-sha1, x-wvn-cdn-cache, x-wvn-resource-source, x-wvn-b2-key, x-wvn-original-key');
  headers.set('X-WVN-B2-Key',metadata.sha256+'.bin');
  headers.set('X-WVN-Original-Key',encodeURIComponent(objectPath.slice(1)));
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-WVN-Resource-Source", "b2");
  headers.set("X-WVN-CDN-Cache", cacheStatus);
  headers.delete("Set-Cookie");
  if (response.status === 200 || response.status === 206) {
    headers.set("Cache-Control", "public, max-age=86400, immutable, no-transform");
    // CDN 只传原始 HTML 字节，避免边缘或代理向游戏入口注入脚本。
    // 账号站的资源网关核验后再以隔离 HTML 提供。
    if (/\.html?$/i.test(objectPath)) headers.set("Content-Type", "application/octet-stream");
    const sha1 = headers.get("x-bz-content-sha1");
    if (!headers.has("etag") && /^[a-f0-9]{40}$/.test(sha1 ?? "")) headers.set("etag", '"' + sha1 + '"');
  } else {
    headers.set("Cache-Control", "no-store");
  }
  return new Response(method === "HEAD" ? null : response.body, { status: response.status, statusText: response.statusText, headers });
}

// PG 大小约束完整表示；范围只允许合法的单范围，流以计数验证而不整包缓冲。
function validateLength(response, metadata, method, cached = false) {
  if (![200,206].includes(response.status)) return null;
  const raw = response.headers.get('content-length');
  const length = raw !== null && /^(0|[1-9][0-9]*)$/.test(raw) ? Number(raw) : null;
  if (raw !== null && !Number.isSafeInteger(length)) throw Error('Invalid B2 length');
  let expected = metadata.bytes;
  if (response.status === 206) {
    if (method !== 'GET') throw Error('Unexpected partial HEAD');
    const match = /^bytes ([0-9]+)-([0-9]+)\/([0-9]+)$/.exec(response.headers.get('content-range') ?? '');
    if (!match) throw Error('Invalid B2 range');
    const [start,end,total] = match.slice(1).map(Number);
    if (![start,end,total].every(Number.isSafeInteger) || start > end || end >= total || total !== metadata.bytes) throw Error('B2 range total mismatch');
    expected = end - start + 1;
  } else if (response.headers.has('content-range')) throw Error('Unexpected B2 range');
  if ((length !== null && length !== expected) || ((method === 'HEAD' || cached) && length === null)) throw Error('B2 length differs from published mapping');
  return expected;
}
function boundResponse(response, metadata, method) {
  let expected;
  try { expected = validateLength(response,metadata,method); }
  catch (error) { response.body?.cancel().catch(() => {}); throw error; }
  if (expected === null || method === 'HEAD') return response;
  if (!response.body) { if (expected !== 0) throw Error('Missing B2 body'); return response; }
  let received = 0;
  const body = response.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > expected) throw Error('B2 body exceeds published size');
      controller.enqueue(chunk);
    },
    flush() { if (received !== expected) throw Error('B2 body shorter than published size'); },
  }));
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
}

async function deadline(promise, milliseconds, onTimeout = () => {}) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => { onTimeout(); reject(Error('Read timed out')); }, milliseconds); })]); }
  finally { clearTimeout(timer); }
}

async function readMetadata(response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('Missing metadata');
  let bytes = 0; const chunks = [];
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > metadataLimit) { await reader.cancel(); throw Error('Metadata too large'); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const combined = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  const value = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(combined));
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.key) || !/^[0-9a-f]{64}$/.test(value.sha256)
    || value.url !== 'https://wg-b2.saop.cc/' + value.sha256 + '.bin' || !Number.isSafeInteger(value.bytes) || value.bytes < 0
    || typeof value.contentType !== 'string' || value.contentType.length > 512 || !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+(?:;[ \x21-\x7e]*)?$/.test(value.contentType)) throw Error('Invalid metadata');
  return value;
}

// 固定公开资源版本；不转发浏览器凭据，不写 B2，不代理账号或存档接口。
export async function handleB2Asset(request, { cache, fetcher = fetch, waitUntil = () => {} }) {
  const url = new URL(request.url);
  // Cloudflare 的已有 B2 URL 重写会先加桶路径；两种入口归一到同一公开对象。
  const bucketPath = "/file/web-visual-novel";
  let objectPath = url.pathname.startsWith(bucketPath + "/") ? url.pathname.slice(bucketPath.length) : url.pathname;
  const resource=/^\/__player\/resource\/([^/]+)\/(.+)$/.exec(objectPath),ons=/^\/__ons\/data\/([^/]+)\/(.+)$/.exec(objectPath);
  const encoded=key=>prefix+key.split('/').map(encodeURIComponent).join('/');
  if(resource||ons){
    const m=resource??ons,directory=assets.games[m[1]];if(!directory)return new Response("Not found",{status:404});
    let path;try{path=decodeURIComponent(m[2]);}catch{return new Response("Not found",{status:404});}
    if(/[\\\u0000-\u001f]/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..')||/\.(env|db|sqlite|exe|ps1|py)$/i.test(path))return new Response("Not found",{status:404});
    const media=assets.media[m[1]+'\0'+path.toLowerCase()];objectPath=encoded(media?'media/'+media:'games/'+directory+'/'+path);
  }else{
    const engine=/^\/__ons\/engine\/64ed1e7b9e92aa83b8106227d6095b3ab951e2bed75ac4bb8ed43f044737de04\/(onsyuri\.(?:js|wasm))$/.exec(objectPath);
    const shared=/^\/__engines\/resource\/(renpy-5b572ebfa6248cac249cab61f698c967cac82b7d225da7515971b383d0f0a3cf)\/(renpy(?:-pre)?\.js|renpy\.(?:wasm|data))$/.exec(objectPath);
    if(engine)objectPath=encoded('games/clannad/'+engine[1]);
    else if(shared)objectPath=encoded('engines/'+shared[1]+'/'+shared[2]);
  }
  if (url.hostname !== host || !objectPath.startsWith(prefix) || objectPath.length <= prefix.length) return new Response("Not found", { status: 404 });
  if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  try{decodeURIComponent(objectPath);}catch{return new Response("Not found",{status:404});}
  const originalPath = decodeURIComponent(objectPath.slice(1));
  if (originalPath.length > 16384 || /[\\\u0000-\u001f\u007f]/.test(originalPath) || originalPath.split('/').some(p => !p || p === '.' || p === '..')) return new Response('Not found', {status:404});
  const metadataURL = new URL('https://wg.saop.cc/api/resources/by-path');
  metadataURL.searchParams.set('namespace', namespace);
  metadataURL.searchParams.set('path', originalPath);
  const metadataKey = new Request(metadataURL + '&wvn-metadata-v=1');
  let metadata;
  const metadataController = new AbortController();
  try {
    metadata = await deadline((async () => {
      const cachedMetadata = await cache.match(metadataKey);
      if (cachedMetadata) return readMetadata(cachedMetadata);
      const response = await fetcher(metadataURL, {method:'GET', headers:{accept:'application/json'}, redirect:'manual', signal:metadataController.signal});
      if (response.status === 404) { await response.body?.cancel(); return null; }
      if (response.status !== 200) { await response.body?.cancel(); throw Error('Metadata unavailable'); }
      const validated = await readMetadata(response);
      await cache.put(metadataKey, Response.json(validated, {headers:{'Cache-Control':'public, max-age=86400'}}));
      return validated;
    })(), metadataTimeout, () => metadataController.abort());
  } catch { return new Response('Resource mapping unavailable', {status:502,headers:{'Cache-Control':'no-store'}}); }
  if (!metadata) return new Response('Not found', {status:404,headers:{'Cache-Control':'no-store'}});
  const objectURL = new URL(origin + '/' + metadata.sha256 + '.bin');
  const keyURL = "https://" + host + objectPath + "?wvn-cdn-v=3&sha256=" + metadata.sha256;
  const headers = new Headers({ "accept-encoding": "identity" });
  for (const name of forwardedHeaders) if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  if (request.method === 'HEAD') { headers.delete('range'); headers.delete('if-range'); }
  // Cache API 不处理 If-Range；先核验完整对象验证器，再交给它处理 Range/条件请求。
  const complete = await cache.match(new Request(keyURL));
  if (complete) {
    try { validateLength(complete, metadata, 'HEAD', true); }
    catch { await complete.body?.cancel(); return new Response('Cached resource length mismatch',{status:502,headers:{'Cache-Control':'no-store'}}); }
    const ifRange = headers.get('if-range');
    let useRange = headers.has('range');
    if (ifRange && useRange) {
      const date = Date.parse(ifRange), modified = Date.parse(complete.headers.get('last-modified'));
      useRange = !ifRange.startsWith('W/') && (ifRange === complete.headers.get('etag') || (!ifRange.startsWith('"') && Number.isFinite(date) && Number.isFinite(modified) && date >= modified));
      if (!useRange) headers.delete('range');
    }
    const etag = complete.headers.get('etag');
    const inm = headers.get('if-none-match');
    const modified = Date.parse(complete.headers.get('last-modified'));
    const ims = Date.parse(headers.get('if-modified-since'));
    if ((inm && (inm.trim() === '*' || inm.split(',').some(v => v.trim().replace(/^W\//,'') === etag?.replace(/^W\//,'')))) || (!inm && Number.isFinite(ims) && Number.isFinite(modified) && modified <= ims)) {
      const conditionalHeaders = new Headers(complete.headers);
      conditionalHeaders.delete('content-length'); conditionalHeaders.delete('content-range');
      return result(new Response(null,{status:304,headers:conditionalHeaders}),request.method,'HIT','/'+originalPath,metadata);
    }
    if (!useRange) return result(boundResponse(complete,metadata,request.method),request.method,'HIT','/'+originalPath,metadata);
    const ranged = await cache.match(new Request(keyURL,{headers:{range:headers.get('range')}}));
    if (ranged?.status === 206 || ranged?.status === 416) {
      try { return result(boundResponse(ranged, metadata, request.method),request.method,'HIT','/'+originalPath,metadata); }
      catch { await ranged.body?.cancel(); return new Response('Cached range mismatch',{status:502,headers:{'Cache-Control':'no-store'}}); }
    }
    // 某些 Cache 实现忽略 Range 并返回 200，此时由 B2 执行 Range。
  }
  for(let attempt=1;attempt<=3;attempt++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DOMException('B2 cache fill timed out','TimeoutError')),30000);
    timer.unref?.();
    try{
      const upstream=await fetcher(objectURL,{method:request.method,headers,redirect:'manual',signal:controller.signal});
      if(upstream.status>=300&&upstream.status<400&&upstream.status!==304){await upstream.body?.cancel();return new Response('B2 redirect refused',{status:502,headers:{'Cache-Control':'no-store','X-WVN-CDN-Cache':'ERROR'}});}
      if(upstream.status>=500){await upstream.body?.cancel();throw Error('B2 returned '+upstream.status);}
      const response=result(boundResponse(upstream,metadata,request.method),request.method,'MISS','/'+originalPath,metadata),size=Number(response.headers.get('content-length'));
      if(request.method==='GET'&&response.status===200&&Number.isSafeInteger(size)&&size>0&&size<=cacheLimit){
        // 在边缘流式收齐小对象后才发响应头，断流可重试；不在应用服务器中转或整包缓冲。
        await deadline(cache.put(new Request(keyURL),response),30000);
        const complete=await cache.match(new Request(keyURL));
        if(!complete)throw Error('B2 edge cache fill was not retained');
        validateLength(complete,metadata,'HEAD',true);
        return result(boundResponse(complete,metadata,request.method),request.method,'MISS','/'+originalPath,metadata);
      }
      // 大游戏包与 Range 直接由 CDN 流式传输，收到响应头后不设总下载期限。
      return response;
    }catch(error){
      console.error('B2 edge read failed',{attempt,name:error?.name,message:error?.message});
      if(attempt===3)return new Response('B2 resource unavailable',{status:502,headers:{'Cache-Control':'no-store','X-WVN-CDN-Cache':'ERROR'}});
    }finally{clearTimeout(timer);}
  }

}

export default {
  fetch(request, _env, context) {
    return handleB2Asset(request, { cache: caches.default, waitUntil: promise => context.waitUntil(promise) });
  },
};
