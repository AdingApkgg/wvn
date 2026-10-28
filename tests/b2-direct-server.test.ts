import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {Hono} from 'hono';
import {players} from '../public/player/registry.mjs';import {registerDirectB2Resources} from '../src/player/b2.server.ts';
function setup(){const entries=Object.fromEntries(players.map(p=>{const source=('runtimeKind' in p)?'<html><head></head><body><script src="engine.js"></script></body></html>':JSON.stringify({args:[],files:[{path:'nscript.dat',lazyload:true}]});return [p.id,{source,bytes:Buffer.byteLength(source),sha1:createHash('sha1').update(source).digest('hex')}]}));const app=new Hono();registerDirectB2Resources(app,{document:{schema:1,entries},origin:'https://localhost:18981',engineReleaseId:'renpy-'+'a'.repeat(64)});return app;}
test('服务端只发送本地启动页、清单和空体跳转，资源正文不回源应用',async()=>{
 const app=setup(),html=await app.request('https://localhost:18981/__player/resource/artemis-v27448-1/index.html');
 const text=await html.text();assert(text.includes('<base href="https://wg-b2.saop.cc/__player/resource/artemis-v27448-1/">'));assert(text.includes('https://localhost:18981/player/runtime.mjs'));assert.match(html.headers.get('content-security-policy')!,/sandbox allow-scripts/);assert(!html.headers.get('content-security-policy')!.includes('allow-same-origin'));
 const manifest=await (await app.request('https://localhost:18981/__ons/manifest/clannad')).json();assert.equal(manifest.files[0].url,'https://wg-b2.saop.cc/__ons/data/clannad/nscript.dat');
 for(const path of ['/__player/resource/renpy-v50789-1/game.zip','/__ons/data/clannad/nscript.dat','/__engines/resource/renpy-'+'a'.repeat(64)+'/renpy.wasm']){const r=await app.request('https://localhost:18981'+path,{headers:{Cookie:'private',Authorization:'private',Range:'bytes=0-10'}});assert.equal(r.status,302);assert.equal(r.headers.get('location'),'https://wg-b2.saop.cc'+path);assert.equal((await r.arrayBuffer()).byteLength,0);assert.equal(r.headers.get('set-cookie'),null);}
 assert.equal((await app.request('https://localhost:18981/__player/resource/artemis-v27448-1/private.env')).status,404);
 assert.equal((await app.request('https://localhost:18981/__ons/data/clannad/unlisted')).status,404);
 assert.equal((await app.request('https://localhost:18981/__player/resource/artemis-v27448-1/artemis.wasm',{method:'POST'})).status,405);
});
