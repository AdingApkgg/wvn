import { test } from "node:test";
import assert from "node:assert/strict";
import { handleB2Asset } from "../ops/b2/cdn-worker.mjs";

const origin = "https://wg-b2.saop.cc";
const path = "/releases/20261027-01/engines/shared/engine.wasm";
test("HTML 以原始对象传输并禁止中间层变换，供网关核验后隔离", async () => {
  const html = "<!doctype html><script src=engine.js></script>";
  const got = await handleB2Asset(new Request(origin + "/releases/20261027-01/games/atri/index.html"), {
    cache: cache(),
    fetcher: async () => new Response(html, { headers: { "content-type": "text/html", "content-length": String(html.length) } }),
    waitUntil: () => {},
  });
  assert.equal(got.headers.get("content-type"), "application/octet-stream");
  assert.match(got.headers.get("cache-control"), /no-transform/);
  assert.equal(await got.text(), html);
});
function cache() {
  const entries = new Map();
  return {
    entries,
    async match(request) { return entries.get(request.url)?.clone(); },
    async put(request, response) { entries.set(request.url, response.clone()); },
  };
}
test("固定版本对象通过 B2 读取并缓存，不转发 cookie 或授权头", async () => {
  const store = cache(), pending = [], calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(new Uint8Array([0,97,115,109]), { headers: { "content-type": "application/wasm", "content-length": "4", "x-bz-content-sha1": "a".repeat(40) } });
  };
  const request = new Request(origin + path + "?cacheBust=1", { headers: { cookie: "private=never-forward", authorization: "Bearer never-forward" } });
  const a = await handleB2Asset(request, { cache: store, fetcher, waitUntil: p => pending.push(p) });
  assert.equal(a.status, 200);
  assert.deepEqual([...new Uint8Array(await a.arrayBuffer())], [0,97,115,109]);
  await Promise.all(pending);
  const b = await handleB2Asset(new Request(origin + path), { cache: store, fetcher, waitUntil: p => pending.push(p) });
  assert.equal(b.headers.get("x-wvn-cdn-cache"), "HIT");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://f003.backblazeb2.com/file/web-visual-novel" + path);
  assert.equal(calls[0].options.headers.get("cookie"), null);
  assert.equal(calls[0].options.headers.get("authorization"), null);
  assert.equal(b.headers.get("access-control-allow-origin"), "*");
});
test("只服务明确资源版本，不建立任意代理或私有接口", async () => {
  let calls = 0;
  const options = { cache: cache(), fetcher: async () => { calls++; throw Error("Unexpected network"); }, waitUntil: () => {} };
  for (const url of [origin + "/api/me", origin + "/releases/other/file.bin", "https://example.com" + path]) {
    assert.equal((await handleB2Asset(new Request(url), options)).status, 404);
  }
  assert.equal((await handleB2Asset(new Request(origin + path, { method: "DELETE" }), options)).status, 405);
  assert.equal(calls, 0);
});
test("Worker 使用支持的 manual 重定向模式，拒绝上游重定向", async () => {
  const store = cache();
  let mode;
  const got = await handleB2Asset(new Request(origin + path), {
    cache: store,
    fetcher: async (_url, options) => {
      mode = options.redirect;
      return new Response(null, { status: 302, headers: { location: "https://example.com/private" } });
    },
    waitUntil: () => {},
  });
  assert.equal(mode, "manual");
  assert.equal(got.status, 502);
  assert.equal(store.entries.size, 0);
});
test("已有 Cloudflare 桶路径重写不重复加前缀，仍限定同一版本", async () => {
  const store = cache();
  const got = await handleB2Asset(new Request(origin + "/file/web-visual-novel" + path), {
    cache: store,
    fetcher: async url => {
      assert.equal(String(url), "https://f003.backblazeb2.com/file/web-visual-novel" + path);
      return new Response("ok", { headers: { "content-length": "2" } });
    },
    waitUntil: () => {},
  });
  assert.equal(got.status, 200);
});
test("5xx 在边缘重试，404 不重试或写入成功缓存", async () => {
  const store = cache(), pending = [];
  let calls = 0;
  const options = { cache: store, fetcher: async () => { calls++; return new Response("unavailable", { status: calls === 1 ? 503 : 404 }); }, waitUntil: p => pending.push(p) };
  assert.equal((await handleB2Asset(new Request(origin + path), options)).status, 404);
  assert.equal((await handleB2Asset(new Request(origin + path), options)).status, 404);
  await Promise.all(pending);
  assert.equal(store.entries.size, 0);
  assert.equal(calls, 3);
});
test("Range 和条件请求保留给上游，部分响应不写完整对象缓存", async () => {
  const store = cache(), pending = [];
  const got = await handleB2Asset(new Request(origin + path, { headers: { Range: "bytes=0-1", "If-Range": '"expected"' } }), {
    cache: store,
    fetcher: async (_url, options) => {
      assert.equal(options.headers.get("range"), "bytes=0-1");
      assert.equal(options.headers.get("if-range"), '"expected"');
      return new Response(new Uint8Array([0, 97]), { status: 206, headers: { "content-length": "2", "content-range": "bytes 0-1/4" } });
    },
    waitUntil: p => pending.push(p),
  });
  assert.equal(got.status, 206);
  assert.equal(got.headers.get("content-range"), "bytes 0-1/4");
  await Promise.all(pending);
  assert.equal(store.entries.size, 0);
});
test("HEAD 不传响应体，大游戏包保持流式且不写小对象缓存", async () => {
  const store = cache(), pending = [];
  const got = await handleB2Asset(new Request(origin + path, { method: "HEAD" }), {
    cache: store,
    fetcher: async (_url, options) => { assert.equal(options.method, "HEAD"); return new Response(null, { headers: { "content-length": String(64 * 1024 ** 2) } }); },
    waitUntil: p => pending.push(p),
  });
  assert.equal(got.status, 200);
  assert.equal((await got.arrayBuffer()).byteLength, 0);
  await Promise.all(pending);
  assert.equal(store.entries.size, 0);
});

test('CDN 虚拟路径直接映射到 B2，不回源主站，保留游戏目录与固定引擎身份',async()=>{
 const seen=[];const options={cache:cache(),fetcher:async url=>{seen.push(String(url));return new Response('bytes',{headers:{'content-length':'5'}})},waitUntil:()=>{}};
 const r=await handleB2Asset(new Request(origin+'/file/web-visual-novel/__player/resource/artemis-v27448-1/artemis.wasm'),options);
 assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/wasm');assert(seen[0].endsWith('/releases/20261027-01/games/atri/artemis.wasm'));
 const shared='renpy-5b572ebfa6248cac249cab61f698c967cac82b7d225da7515971b383d0f0a3cf';
 assert.equal((await handleB2Asset(new Request(origin+'/__engines/resource/'+shared+'/renpy.data'),options)).status,200);assert(seen.at(-1).endsWith('/engines/'+shared+'/renpy.data'));
 assert.equal((await handleB2Asset(new Request(origin+'/__player/resource/unknown/game.zip'),options)).status,404);
});

test('CDN 小对象先完整填入边缘缓存，再发送响应头；断流在边缘重新只读读取',async()=>{
 const entries=new Map();let finish,returned=false,calls=0;
 const store={async match(r){return entries.get(r.url)?.clone()},async put(r,response){const bytes=await response.arrayBuffer();entries.set(r.url,new Response(bytes,{headers:response.headers}))}};
 const deferred=new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));finish=()=>{c.enqueue(new Uint8Array([2,3,4]));c.close();}}});
 const pending=handleB2Asset(new Request(origin+path),{cache:store,fetcher:async()=>new Response(deferred,{headers:{'content-length':'4'}})}).then(r=>{returned=true;return r});
 await new Promise(r=>setTimeout(r,20));assert.equal(returned,false);finish();assert.deepEqual([...new Uint8Array(await (await pending).arrayBuffer())],[1,2,3,4]);
 const retryStore={...store,entries:new Map(),async match(){},async put(_r,response){await response.arrayBuffer();if(calls>1)entries.set('retry',new Response(new Uint8Array([1,2,3,4]),{headers:{'content-length':'4'}}));}};
 retryStore.match=async()=>entries.get('retry')?.clone();
 const recovered=await handleB2Asset(new Request(origin+path+'?new'),{cache:retryStore,fetcher:async()=>{calls++;if(calls===1)return new Response(new ReadableStream({start(c){setTimeout(()=>c.error(Error('upstream body interrupted')),5)}}),{headers:{'content-length':'4'}});return new Response(new Uint8Array([1,2,3,4]),{headers:{'content-length':'4'}});}});
 assert.equal(recovered.status,200);assert.equal((await recovered.arrayBuffer()).byteLength,4);assert.equal(calls,2);
});
