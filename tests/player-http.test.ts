import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Hono} from 'hono';
import{createHash}from'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {isolateEntry,registerOtherPlayers} from '../src/player/http.server.ts';
import {otherPlayers,players} from '../public/player/registry.mjs';
import {validateSnapshot} from '../public/ons/protocol.mjs';

test('all 79 stable version identities resolve and remain isolated across versions',()=>{
 for(const player of otherPlayers)assert.equal(createHash('sha256').update(JSON.stringify(player.engineFiles)).digest('hex'),player.engine);
 assert.equal(players.length,79);assert.equal(otherPlayers.length,53);assert.equal(new Set(players.map(p=>p.versionId)).size,79);
 for(const p of players){assert.match(p.engine,/^[0-9a-f]{64}$/);assert.equal(validateSnapshot({schema:1,pilot:p.id,files:[]},p.id).pilot,p.id)}
});
test('entry scripts are inert until authenticated parent channel and resources are sandboxed on direct navigation',async()=>{
 const html=isolateEntry('<html><head><base href="https://evil.invalid"><link rel="stylesheet" href="tyrano.css"><script src="engine.js"></script></head><body><script>window.starts++;</script></body></html>','artemis-v27448-1');
 assert.match(html,/<link\b[^>]*crossorigin="anonymous"[^>]*>/i);
 assert.doesNotMatch(html,/<script src="engine.js"/);assert.doesNotMatch(html,/href="https:\/\/evil/);assert.match(html,/application\/x-wg-script/);
 const root=mkdtempSync(join(tmpdir(),'wg-player-'));
 try{
  mkdirSync(join(root,'atri'));writeFileSync(join(root,'atri/index.html'),'<html><head></head><body>Game</body></html>');writeFileSync(join(root,'atri/artemis.js'),'void 0;');
  const app=new Hono();registerOtherPlayers(app,root,{mediaManifest:{schema:1,entries:[]}});
  const invalidEngine=await app.request('https://localhost/__player/runtime/artemis-v27448-1');assert.equal(invalidEngine.status,503);
  assert.equal((await app.request('https://localhost/__player/resource/artemis-v27448-1/index.html')).status,404);
  for(const path of ['/__player/resource/artemis-v27448-1/artemis.js']){
   const r=await app.request('https://localhost'+path);assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy')!,/sandbox allow-scripts;/);assert.doesNotMatch(r.headers.get('content-security-policy')!,/allow-same-origin/);assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.equal(r.headers.get('access-control-allow-credentials'),null);
  }
  for(const path of ['/__player/resource/artemis-v27448-1/%252e%252e/private','/__player/resource/artemis-v27448-1/manage.html','/__player/resource/nope/index.html'])assert.equal((await app.request('https://localhost'+path)).status,404);
 }finally{rmSync(root,{recursive:true,force:true})}
});

test('opaque preflight is granted only for read-only scoped resources, never private APIs or credentials',async()=>{
 const {createAccountService}=await import('../src/accounts/service.server.ts');
 const {isPlayerResourcePath}=await import('../src/player/http.server.ts');
 const service=await createAccountService({origin:'https://localhost',database:':memory:',secret:'x'.repeat(48),publicResourcePreflight:isPlayerResourcePath});
 try{
  const headers={Origin:'null','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'X-Requested-With'};
  const ok=await service.app.request('https://localhost/__player/resource/tyrano-v18636-1/tyrano/plugins/kag/kag.js',{method:'OPTIONS',headers});assert.equal(ok.status,204);assert.equal(ok.headers.get('Access-Control-Allow-Origin'),'*');assert.equal(ok.headers.get('Access-Control-Allow-Credentials'),null);
  for(const path of ['/api/me','/api/auth/session','/__player/resource/unknown/private'])assert.equal((await service.app.request('https://localhost'+path,{method:'OPTIONS',headers})).status,403);
  for(const extra of [{'Access-Control-Request-Method':'POST'},{'Access-Control-Request-Headers':'Authorization'}])assert.equal((await service.app.request('https://localhost/__player/resource/tyrano-v18636-1/a',{method:'OPTIONS',headers:{...headers,...extra}})).status,403);
 }finally{service.close()}
});
