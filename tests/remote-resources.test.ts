import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { registerRemotePlayerResources } from '../src/player/remote.server.ts';

function setup(fetcher: typeof fetch) {
  const app = new Hono();
  registerRemotePlayerResources(app, { upstream: 'http://192.0.2.20:18571', fetcher });
  return app;
}
test('split resources forward only public GET/HEAD paths and never account credentials', async () => {
  const seen: Request[] = [];
  const app = setup(async (input, init) => {
    const request = new Request(input, init); seen.push(request);
    return new Response(request.method === 'HEAD' ? null : 'wasm', { status: 206, headers: {
      'Content-Type': 'application/wasm', 'Content-Length': '4', 'Content-Range': 'bytes 0-3/100',
      'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin',
      'Set-Cookie': 'stolen=1', 'Access-Control-Allow-Credentials': 'true',
    } });
  });
  for (const method of ['GET', 'HEAD']) {
    const r = await app.request('https://localhost:18551/__ons/data/clannad/a.ogg', { method, headers: {
      Cookie: '__Host-wg=private', Authorization: 'private', 'X-WG-Binding': 'private',
      Origin: 'null', Range: 'bytes=0-3', 'X-Forwarded-Host': 'evil.invalid',
    } });
    assert.equal(r.status, 206); assert.equal(r.headers.get('Content-Range'), 'bytes 0-3/100');
    assert.equal(r.headers.get('Set-Cookie'), null); assert.equal(r.headers.get('Access-Control-Allow-Credentials'), null);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*');
  }
  assert.equal(seen.length, 2);
  for (const r of seen) {
    assert.equal(r.url, 'http://192.0.2.20:18571/__ons/data/clannad/a.ogg');
    assert.deepEqual([...r.headers.keys()].sort(), ['accept-encoding', 'range']);
  }
  for (const path of ['/api/me', '/ons/runtime.js', '/player/runtime.mjs', '/__ons/data/nope/a', '/__ons/data/clannad/%252e%252e/secret', '/__player/resource/nope/a', '/__player/resource/artemis-v27448-1/.env']) {
    assert.equal((await app.request('https://localhost:18551' + path)).status, 404, path);
  }
  assert.equal((await app.request('https://localhost:18551/__ons/data/clannad/a', { method: 'POST' })).status, 405);
  assert.equal(seen.length, 2);
});
test('split runtime preserves opaque sandbox policy using the actual preview origin', async () => {
  const app = setup(async () => new Response('<html>game</html>', { headers: {
    'Content-Type': 'text/html',
    'Content-Security-Policy': "sandbox allow-scripts; script-src https://wg.saop.cc/ons/; connect-src https://wg.saop.cc/__ons/; frame-ancestors 'self'",
    'Location': '/__player/resource/artemis-v27448-1/index.html',
  } }));
  const r = await app.request('https://localhost:18551/__ons/runtime/clannad');
  assert.match(r.headers.get('Content-Security-Policy')!, /sandbox allow-scripts;/);
  assert.match(r.headers.get('Content-Security-Policy')!, /https:\/\/localhost:18551\/ons\//);
  assert.doesNotMatch(r.headers.get('Content-Security-Policy')!, /allow-same-origin|wg\.saop\.cc/);
});
test('split resources fail closed on upstream errors and redirect to another host', async () => {
  for (const fetcher of [async () => { throw Error('private network failure'); }, async () => new Response(null, { status: 302, headers: { Location: 'https://evil.invalid/' } })]) {
    const app = setup(fetcher);
    const r = await app.request('https://localhost/__player/runtime/artemis-v27448-1');
    assert.equal(r.status, 502); assert.doesNotMatch(await r.text(), /private network/);
  }
});

test('RenPy unqualified resources stay legacy while the session uses immutable candidate URLs',async()=>{
 const {validateCandidate}=await import('../src/engines/candidate.ts'),{loadEngineRegistry,releaseIdentity}=await import('../src/engines/registry.ts');const r=loadEngineRegistry(),files=['renpy-pre.js','renpy.js','renpy.wasm','renpy.data'].map(path=>({path,sha256:'a'.repeat(64)})),release={id:releaseIdentity({kind:'RenPy',mode:'global',files}),kind:'RenPy',mode:'global',files,sourceCapability:'source-build',sourceCommit:'c'.repeat(40),sdk:'emsdk-3.1.24-linux-x64'},candidate=validateCandidate({schema:1,release,versionIds:['legacy-2bc9744f4a39fda45c162027'],compatibility:'unknown'},r,'preview');
 let requests=0;const app=new Hono();registerRemotePlayerResources(app,{upstream:'http://192.0.2.20:18571',candidate: id=>id==='renpy-v1286-1'?candidate:null,fetcher:async()=>{requests++;return new Response('legacy',{headers:{'Content-Security-Policy':"sandbox allow-scripts; script-src https://wg.saop.cc/player/; connect-src https://wg.saop.cc/__player/"}})}});
 for(const f of files){const response=await app.request('https://localhost:18556/__player/resource/renpy-v1286-1/'+f.path);assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);assert.equal(await response.text(),'legacy')}
 assert.equal(requests,4);const html=await app.request('https://localhost:18556/__player/resource/renpy-v1286-1/index.html');assert.match(html.headers.get('content-security-policy')!,new RegExp('/__engines/resource/'+release.id+'/'));assert.doesNotMatch(html.headers.get('content-security-policy')!,/allow-same-origin/);assert.equal(html.headers.get('cache-control'),'no-store');
 await app.request('https://localhost:18556/__player/resource/renpy-v1286-1/game.zip');await app.request('https://localhost:18556/__player/resource/renpy-v10597-1/renpy.js');assert.equal(requests,7);
});
