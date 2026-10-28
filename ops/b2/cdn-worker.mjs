import assets from './public-assets.mjs';
const prefix = "/releases/20261027-01/";
const host = "wg-b2.saop.cc";
const origin = "https://f003.backblazeb2.com/file/web-visual-novel";
const cacheLimit = 32 * 1024 ** 2;
const forwardedHeaders = ["range", "if-range", "if-none-match", "if-modified-since"];

function result(response, method, cacheStatus, objectPath) {
  const headers = new Headers(response.headers);
  const ext=objectPath.split('.').at(-1).toLowerCase(),mime={js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',wasm:'application/wasm',css:'text/css; charset=utf-8',json:'application/json',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',mp4:'video/mp4',ogg:'audio/ogg',ogv:'video/ogg',mp3:'audio/mpeg',wav:'audio/wav',ttf:'font/ttf',otf:'font/otf',woff:'font/woff',woff2:'font/woff2'};
  if(mime[ext])headers.set('Content-Type',mime[ext]);
  headers.set('Access-Control-Expose-Headers','Content-Length, Content-Range, Accept-Ranges, ETag, x-bz-content-sha1, x-wvn-cdn-cache, x-wvn-resource-source, x-wvn-b2-key');
  headers.set('X-WVN-B2-Key',encodeURIComponent(decodeURIComponent(objectPath.slice(prefix.length))));
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
  const objectURL = new URL(origin + objectPath);
  const keyURL = "https://" + host + objectPath + "?wvn-cdn-v=2";
  const headers = new Headers({ "accept-encoding": "identity" });
  for (const name of forwardedHeaders) if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  const lookup = new Request(keyURL, { headers });
  let cached = await cache.match(lookup);
  if (cached) {
    const ifRange = headers.get("if-range");
    if (ifRange && headers.has("range")) {
      const date = Date.parse(ifRange), modified = Date.parse(cached.headers.get("last-modified"));
      if (ifRange !== cached.headers.get("etag") && !(Number.isFinite(date) && Number.isFinite(modified) && date >= modified)) cached = await cache.match(new Request(keyURL));
    }
    if (cached) return result(cached, request.method, "HIT", objectPath);
  }
  for(let attempt=1;attempt<=3;attempt++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DOMException('B2 cache fill timed out','TimeoutError')),30000);
    timer.unref?.();
    try{
      const upstream=await fetcher(objectURL,{method:request.method,headers,redirect:'manual',signal:controller.signal});
      if(upstream.status>=300&&upstream.status<400&&upstream.status!==304){await upstream.body?.cancel();return new Response('B2 redirect refused',{status:502,headers:{'Cache-Control':'no-store','X-WVN-CDN-Cache':'ERROR'}});}
      if(upstream.status>=500){await upstream.body?.cancel();throw Error('B2 returned '+upstream.status);}
      const response=result(upstream,request.method,'MISS',objectPath),size=Number(response.headers.get('content-length'));
      if(request.method==='GET'&&response.status===200&&Number.isSafeInteger(size)&&size>0&&size<=cacheLimit){
        // 在边缘流式收齐小对象后才发响应头，断流可重试；不在应用服务器中转或整包缓冲。
        await cache.put(new Request(keyURL),response);
        const complete=await cache.match(new Request(keyURL));
        if(!complete)throw Error('B2 edge cache fill was not retained');
        return result(complete,request.method,'MISS',objectPath);
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
