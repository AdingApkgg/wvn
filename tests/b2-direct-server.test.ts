import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {Hono} from 'hono';
import {gunzipSync} from 'node:zlib';
import {players} from '../public/player/registry.mjs';import {registerDirectB2Resources} from '../src/player/b2.server.ts';
function setup(cas=false){const entries=Object.fromEntries(players.map(p=>{const source=('runtimeKind' in p)?'<html><head></head><body><script src="engine.js"></script></body></html>':JSON.stringify({args:[],files:[{path:'nscript.dat',lazyload:true}]});return [p.id,{source,bytes:Buffer.byteLength(source),sha1:createHash('sha1').update(source).digest('hex')}]}));const app=new Hono();registerDirectB2Resources(app,{document:{schema:1,entries},origin:'https://localhost:18981',cas,engineReleaseId:'renpy-'+'a'.repeat(64)});return app;}
test('服务端只发送本地启动页、清单和空体跳转，资源正文不回源应用',async()=>{
 const app=setup(),html=await app.request('https://localhost:18981/__player/resource/artemis-v27448-1/index.html');
 const text=await html.text();assert(text.includes('<base href="https://wg-b2.saop.cc/__player/resource/artemis-v27448-1/">'));assert(text.includes('https://localhost:18981/player/runtime.mjs'));assert.match(html.headers.get('content-security-policy')!,/sandbox allow-scripts/);assert(!html.headers.get('content-security-policy')!.includes('allow-same-origin'));
 const manifest=await (await app.request('https://localhost:18981/__ons/manifest/clannad')).json();assert.equal(manifest.files[0].url,'https://wg-b2.saop.cc/__ons/data/clannad/nscript.dat');
 for(const path of ['/__player/resource/renpy-v50789-1/game.zip','/__ons/data/clannad/nscript.dat','/__engines/resource/renpy-'+'a'.repeat(64)+'/renpy.wasm']){const r=await app.request('https://localhost:18981'+path,{headers:{Cookie:'private',Authorization:'private',Range:'bytes=0-10'}});assert.equal(r.status,302);assert.equal(r.headers.get('location'),'https://wg-b2.saop.cc'+path);assert.equal((await r.arrayBuffer()).byteLength,0);assert.equal(r.headers.get('set-cookie'),null);}
 assert.equal((await app.request('https://localhost:18981/__player/resource/artemis-v27448-1/private.env')).status,404);
 assert.equal((await app.request('https://localhost:18981/__ons/data/clannad/unlisted')).status,404);
 assert.equal((await app.request('https://localhost:18981/__player/resource/artemis-v27448-1/artemis.wasm',{method:'POST'})).status,405);
});


test('ONS 清单协商 gzip，完整解压后仍是同一份 UTF-8 清单',async()=>{
 const app=setup(),url='https://localhost:18981/__ons/manifest/ons-v1194-1';
 const plain=await app.request(url),raw=new Uint8Array(await plain.arrayBuffer());
 const response=await app.request(url,{headers:{'Accept-Encoding':'br, gzip'}});
 assert.equal(response.headers.get('content-encoding'),'gzip');
 assert.equal(response.headers.get('vary'),'Accept-Encoding');
 assert.match(response.headers.get('cache-control')!,/no-store/);
 const wire=new Uint8Array(await response.arrayBuffer());assert.equal(Number(response.headers.get('content-length')),wire.length);
 assert(wire.length<raw.length);assert.deepEqual(new Uint8Array(gunzipSync(wire)),raw);
 const parsed=JSON.parse(gunzipSync(wire).toString('utf8'));
 assert.equal(parsed.pilot,'ons-v1194-1');assert.equal(parsed.gamedir,'/game');assert.equal(parsed.savedir,'/save');
 assert.equal(parsed.files[0].url,'https://wg-b2.saop.cc/__ons/data/ons-v1194-1/nscript.dat');
});

test('ONS 清单尊重 gzip 禁用与通配协商，HEAD 不发送正文',async()=>{
 const app=setup(),url='https://localhost:18981/__ons/manifest/clannad';
 for(const [accept,want] of [['identity',null],['gzip;q=0',null],['gzip;q=0, *;q=1',null],['GZip; q=0.5','gzip'],['*;q=1','gzip']]){
  const response=await app.request(url,{headers:{'Accept-Encoding':accept!}});assert.equal(response.headers.get('content-encoding'),want);
  const bytes=await response.arrayBuffer();assert.equal(Number(response.headers.get('content-length')),bytes.byteLength);
 }
 const get=await app.request(url,{headers:{'Accept-Encoding':'gzip'}}),head=await app.request(url,{method:'HEAD',headers:{'Accept-Encoding':'gzip'}});
 assert.equal(head.headers.get('content-encoding'),'gzip');assert.equal(head.headers.get('content-length'),get.headers.get('content-length'));
 assert.equal((await head.arrayBuffer()).byteLength,0);
});

test('CAS 入口在清单就绪前惰性，所有旧正文端点关闭且不跳转',async()=>{
 const app=setup(true),response=await app.request('/__player/resource/artemis-v27448-1/index.html');
 const html=await response.text();assert.match(html,/<template id="wg-cas-document">/);assert.match(html,/application\/x-wg-script/);
 assert.match(response.headers.get('content-security-policy')!,/connect-src https:\/\/wg-b2.saop.cc/);
 for(const path of ['/__ons/manifest/clannad','/__ons/data/clannad/nscript.dat','/__ons/engine/abc/onsyuri.js','/__player/resource/artemis-v27448-1/artemis.wasm','/__engines/resource/renpy-'+ 'a'.repeat(64)+'/renpy.wasm']){
  const r=await app.request(path);assert.equal(r.status,404);assert.equal(r.headers.get('location'),null);
 }
});
