import { test } from "node:test";
import assert from "node:assert/strict";
import { handleB2Asset as rawHandle } from "../ops/b2/cdn-worker.mjs";

const sha = 'a'.repeat(64);
const metadata = { key: '12345678-1234-4234-8234-123456789abc', sha256: sha, bytes: 4, contentType: 'application/wasm', url: 'https://wg-b2.saop.cc/' + sha + '.bin' };
function handleB2Asset(request, options) {
 const fetcher = options.fetcher;
 return rawHandle(request, {...options, fetcher: (url, opts) => String(url).startsWith('https://wg.saop.cc/api/resources/by-path?') ? Promise.resolve(Response.json({...metadata,bytes:options.metadataBytes ?? 4})) : fetcher(url,opts)});
}
const origin = "https://wg-b2.saop.cc";
const path = "/releases/20261027-01/engines/shared/engine.wasm";
test("HTML 以原始对象传输并禁止中间层变换，供网关核验后隔离", async () => {
  const html = "<!doctype html><script src=engine.js></script>";
  const got = await handleB2Asset(new Request(origin + "/releases/20261027-01/games/atri/index.html"), {
    cache: cache(), metadataBytes:html.length,
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
  assert.equal(calls[0].url, "https://f003.backblazeb2.com/file/web-visual-novel/" + sha + ".bin");
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
  assert.equal([...store.entries.keys()].filter(k=>k.includes("wvn-cdn-v=")).length, 0);
});
test("已有 Cloudflare 桶路径重写不重复加前缀，仍限定同一版本", async () => {
  const store = cache();
  const got = await handleB2Asset(new Request(origin + "/file/web-visual-novel" + path), {
    cache: store, metadataBytes:2,
    fetcher: async url => {
      assert.equal(String(url), "https://f003.backblazeb2.com/file/web-visual-novel/" + sha + ".bin");
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
  assert.equal([...store.entries.keys()].filter(k=>k.includes("wvn-cdn-v=")).length, 0);
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
  assert.equal([...store.entries.keys()].filter(k=>k.includes("wvn-cdn-v=")).length, 0);
});
test("HEAD 不传响应体，大游戏包保持流式且不写小对象缓存", async () => {
  const store = cache(), pending = [];
  const got = await handleB2Asset(new Request(origin + path, { method: "HEAD" }), {
    cache: store, metadataBytes:64*1024**2,
    fetcher: async (_url, options) => { assert.equal(options.method, "HEAD"); return new Response(null, { headers: { "content-length": String(64 * 1024 ** 2) } }); },
    waitUntil: p => pending.push(p),
  });
  assert.equal(got.status, 200);
  assert.equal((await got.arrayBuffer()).byteLength, 0);
  await Promise.all(pending);
  assert.equal([...store.entries.keys()].filter(k=>k.includes("wvn-cdn-v=")).length, 0);
});

test('CDN 虚拟路径经固定映射查询后读取 CAS，保留游戏目录与固定引擎身份',async()=>{
 const seen=[];const options={cache:cache(),metadataBytes:5,fetcher:async url=>{seen.push(String(url));return new Response('bytes',{headers:{'content-length':'5'}})},waitUntil:()=>{}};
 const r=await handleB2Asset(new Request(origin+'/file/web-visual-novel/__player/resource/artemis-v27448-1/artemis.wasm'),options);
 assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/wasm');assert(seen[0].endsWith('/'+sha+'.bin'));
 const shared='renpy-5b572ebfa6248cac249cab61f698c967cac82b7d225da7515971b383d0f0a3cf';
 assert.equal((await handleB2Asset(new Request(origin+'/__engines/resource/'+shared+'/renpy.data'),options)).status,200);assert(seen.at(-1).endsWith('/'+sha+'.bin'));
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


test('映射不存在或不可信时禁止请求旧 B2 key，缓存元数据也必须重新验证', async () => {
 for (const value of [null, {...metadata, sha256:'BAD'}, {...metadata,url:'https://evil.invalid/x'}, {...metadata,key:'bad'}, {...metadata,bytes:-1}, {...metadata,contentType:'text/html\r\nX: y'}]) {
  const calls=[];
  const response=await rawHandle(new Request(origin+path),{cache:cache(),fetcher:async url=>{calls.push(String(url));return value===null?new Response(null,{status:404}):Response.json(value)}});
  assert.equal(response.status,value===null?404:502);assert.equal(calls.length,1);assert(calls[0].startsWith('https://wg.saop.cc/api/resources/by-path?'));
 }
});


test('已缓存错误映射必须拒绝，不可回退旧正文；元数据有大小边界', async () => {
 for (const content of [JSON.stringify({...metadata, bytes:1.5}), ' '.repeat(8193)]) {
  let calls=0;
  const response=await rawHandle(new Request(origin+path),{cache:{async match(){return new Response(content)},async put(){throw Error('must not cache')}},fetcher:async()=>{calls++;throw Error('unexpected')}});
  assert.equal(response.status,502); assert.equal(calls,0);
 }
 const response=await rawHandle(new Request(origin+path),{cache:cache(),fetcher:async()=>new Response(' '.repeat(8193))});
 assert.equal(response.status,502);
});

test('缓存条件请求返回无正文 304，If-Range 失配返回完整对象，匹配时传给 Cache Range', async () => {
 const store=cache(); let reads=0;
 const options={cache:store,fetcher:async()=>{reads++;return new Response('abcd',{headers:{'content-length':'4',etag:'"v1"','last-modified':'Wed, 21 Oct 2015 07:28:00 GMT'}})}};
 await (await handleB2Asset(new Request(origin+path),options)).text();
 const conditional=await handleB2Asset(new Request(origin+path,{headers:{'if-none-match':'W/"v1"'}}),options);
 assert.equal(conditional.status,304);assert.equal(await conditional.text(),'');assert.equal(conditional.headers.get('content-length'),null);
 const mismatch=await handleB2Asset(new Request(origin+path,{headers:{range:'bytes=0-1','if-range':'"old"'}}),options);
 assert.equal(mismatch.status,200);assert.equal(await mismatch.text(),'abcd');assert.equal(reads,1);
 const originalMatch=store.match;
 store.match=async r=>r.headers.has('range')?new Response('ab',{status:206,headers:{'content-length':'2','content-range':'bytes 0-1/4'}}):originalMatch(r);
 const match=await handleB2Asset(new Request(origin+path,{headers:{range:'bytes=0-1','if-range':'"v1"'}}),options);
 assert.equal(match.status,206);assert.equal(await match.text(),'ab');assert.equal(reads,1);
});

test('未知长度与大对象收到头即流式返回，诊断标明物理 SHA 与原路径', async () => {
 let finish;
 const response=await handleB2Asset(new Request(origin+path),{cache:cache(),metadataBytes:1,fetcher:async()=>new Response(new ReadableStream({start(c){finish=()=>{c.enqueue(new Uint8Array([1]));c.close()}}}))});
 assert.equal(response.status,200);assert.equal(response.headers.get('x-wvn-b2-key'),sha+'.bin');
 assert.equal(decodeURIComponent(response.headers.get('x-wvn-original-key')),path.slice(1));finish();assert.equal((await response.arrayBuffer()).byteLength,1);
});

test('映射查询固定命名空间、Unicode 路径与 MIME，拒绝重定向',async()=>{
 let calls=[];
 const response=await rawHandle(new Request(origin+'/releases/20261027-01/games/test/'+encodeURIComponent('故事.txt')),{cache:cache(),fetcher:async(url,opts)=>{calls.push(String(url));if(calls.length===1){const u=new URL(url);assert.equal(u.origin,'https://wg.saop.cc');assert.equal(u.searchParams.get('namespace'),'b2/web-visual-novel/snapshot-20261028');assert.equal(u.searchParams.get('path'),'releases/20261027-01/games/test/故事.txt');assert.equal(opts.redirect,'manual');return Response.json({...metadata,contentType:'text/plain'})}assert.equal(String(url),'https://f003.backblazeb2.com/file/web-visual-novel/'+sha+'.bin');return new Response('data',{headers:{'content-length':'4'}})}});
 assert.equal(response.headers.get('content-type'),'text/plain');assert.equal(await response.text(),'data');
 const redirect=await rawHandle(new Request(origin+path),{cache:cache(),fetcher:async()=>new Response(null,{status:302,headers:{location:'https://evil.invalid'}})});
 assert.equal(redirect.status,502);
});

test('元数据网络与正文读取共用独立五秒期限，不请求 B2', {timeout:8000}, async () => {
 let calls=0;
 const started=Date.now();
 const response=await rawHandle(new Request(origin+path),{cache:cache(),fetcher:async()=>{calls++;return new Response(new ReadableStream({start(){}}))}});
 assert.equal(response.status,502);assert.equal(calls,1);assert(Date.now()-started<7000);
});

test('小对象正文超过声明长度会停止缓存并重试，未知长度不做完整填充', async () => {
 const entries=new Map();let reads=0;
 const store={async match(r){return entries.get(r.url)?.clone()},async put(r,res){const bytes=await res.arrayBuffer();entries.set(r.url,new Response(bytes,{headers:res.headers}))}};
 const response=await handleB2Asset(new Request(origin+path),{cache:store,fetcher:async()=>{reads++;return new Response(reads===1?'too long':'abcd',{headers:{'content-length':'4'}})}});
 assert.equal(response.status,200);assert.equal(await response.text(),'abcd');assert.equal(reads,2);
});

function rawFixture(bytes, responder, store=cache()) {
 return {cache:store,fetcher:async(url,opts)=>String(url).startsWith('https://wg.saop.cc/')?Response.json({...metadata,bytes,contentType:'text/html'}):responder(url,opts)};
}
test('复审：编码 HTML 路径必须统一隔离 MIME',async()=>{
 for(const ending of ['index%2Ehtml','index.%68tml','index.ht%6Dl']){
  const r=await rawHandle(new Request(origin+'/releases/20261027-01/games/atri/'+ending),rawFixture(4,async()=>new Response('html',{headers:{'content-length':'4','content-type':'application/octet-stream'}})));
  assert.equal(r.headers.get('content-type'),'application/octet-stream');
 }
});
test('复审：完整响应、HEAD、206 与缓存长度必须符合 PG',async()=>{
 for(const method of ['GET','HEAD']){
  const store=cache();
  const r=await rawHandle(new Request(origin+path,{method}),rawFixture(4,async()=>new Response(method==='HEAD'?null:'bad',{headers:{'content-length':'3'}}),store));
  assert.equal(r.status,502);assert.equal([...store.entries.keys()].filter(k=>k.includes('wvn-cdn-v=')).length,0);
 }
 for(const range of ['bytes 0-1/5','bytes 1-0/4','bytes 0-4/4','bytes 0-1/*','nonsense']){
  const r=await rawHandle(new Request(origin+path,{headers:{range:'bytes=0-1'}}),rawFixture(4,async()=>new Response('ab',{status:206,headers:{'content-length':'2','content-range':range}})));
  assert.equal(r.status,502);
 }
 const store=cache();const match=store.match;
 store.match=async r=>r.url.includes('wvn-cdn-v=')?new Response('bad',{headers:{'content-length':'3'}}):match(r);
 const r=await rawHandle(new Request(origin+path),rawFixture(4,async()=>new Response('abcd',{headers:{'content-length':'4'}}),store));
 assert.equal(r.status,502);
});
test('复审：未知长度流不缓冲且按 PG 大小截断或报短流',async()=>{
 for(const body of ['bad','longer']){
  const r=await rawHandle(new Request(origin+path),rawFixture(4,async()=>new Response(body)));
  await assert.rejects(r.arrayBuffer());
 }
});
test('复审：HEAD 在缓存与上游均忽略 Range',async()=>{
 const store=cache();let reads=0;
 const opts=rawFixture(4,async(_url,options)=>{reads++;assert.equal(options.headers.get('range'),null);assert.equal(options.headers.get('if-range'),null);return new Response(null,{headers:{'content-length':'4'}})},store);
 const request=()=>new Request(origin+path,{method:'HEAD',headers:{range:'bytes=0-0','if-range':'"v1"'}});
 const cold=await rawHandle(request(),opts);assert.equal(cold.status,200);assert.equal(cold.headers.get('content-length'),'4');
 const match=store.match;store.match=async r=>r.url.includes('wvn-cdn-v=')?(r.headers.has('range')?new Response('a',{status:206,headers:{'content-length':'1','content-range':'bytes 0-0/4'}}):new Response('abcd',{headers:{'content-length':'4'}})):match(r);
 const warm=await rawHandle(request(),opts);assert.equal(warm.status,200);assert.equal(warm.headers.get('content-length'),'4');assert.equal(warm.headers.get('content-range'),null);assert.equal(reads,1);
});
test('复审：元数据 Cache match/put 均受完整五秒阶段期限约束',{timeout:8000},async()=>{
 await Promise.all(['match','put'].map(async name=>{
  const store=cache();store[name]=async()=>new Promise(()=>{});
  const r=await Promise.race([rawHandle(new Request(origin+path),rawFixture(4,async()=>{throw Error('must not read B2')},store)),new Promise(resolve=>setTimeout(()=>resolve(null),6500))]);
  assert(r,'metadata stage must finish');assert.equal(r.status,502);
 }));
});


test('复审：缓存正文与合法206也按预期长度流式计数，正确大对象不缓冲',async()=>{
 const store=cache();const match=store.match;
 store.match=async r=>r.url.includes('wvn-cdn-v=')?new Response('bad',{headers:{'content-length':'4'}}):match(r);
 const cached=await rawHandle(new Request(origin+path),rawFixture(4,async()=>{throw Error('no B2')},store));
 await assert.rejects(cached.arrayBuffer());
 const partial=await rawHandle(new Request(origin+path,{headers:{range:'bytes=0-1'}}),rawFixture(4,async()=>new Response('ab',{status:206,headers:{'content-range':'bytes 0-1/4','content-length':'2'}})));
 assert.equal(partial.status,206);assert.equal(await partial.text(),'ab');
 const mismatch=await rawHandle(new Request(origin+path,{headers:{range:'bytes=0-1'}}),rawFixture(4,async()=>new Response('a',{status:206,headers:{'content-range':'bytes 0-1/4','content-length':'1'}})));
 assert.equal(mismatch.status,502);
 let end;
 const large=await rawHandle(new Request(origin+path),rawFixture(40*1024**2,async()=>new Response(new ReadableStream({start(c){end=()=>c.close()}}),{headers:{'content-length':String(40*1024**2)}})));
 assert.equal(large.status,200);end();await assert.rejects(large.arrayBuffer());
});
