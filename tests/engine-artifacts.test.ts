import{test}from'node:test';import assert from'node:assert/strict';import{mkdtempSync,mkdirSync,writeFileSync,rmSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';
import{Hono}from'hono';import{sha256,releaseIdentity}from'../src/engines/registry.ts';import{registerEngineArtifacts}from'../src/engines/artifacts.ts';

test('immutable engine resources verify registered bytes and support GET HEAD Range only',async()=>{
 const root=mkdtempSync(join(tmpdir(),'wvn-artifact-http-')),bytes=Buffer.from('0123456789'),files=[{path:'engine.wasm',sha256:sha256(bytes)}],release={id:releaseIdentity({kind:'ONS',mode:'factory',files}),kind:'ONS',mode:'factory',files};mkdirSync(join(root,release.id));writeFileSync(join(root,release.id,'engine.wasm'),bytes);
 try{
  const app=new Hono();registerEngineArtifacts(app,{root,releases:[release]});const path='/__engines/resource/'+release.id+'/engine.wasm';
  const response=await app.request(path,{headers:{Range:'bytes=2-4',Cookie:'private'}});assert.equal(response.status,206);assert.equal(await response.text(),'234');assert.match(response.headers.get('cache-control')!,/immutable/);assert.equal(response.headers.get('access-control-allow-credentials'),null);assert.equal(response.headers.get('content-type'),'application/wasm');
  assert.equal(await(await app.request(path,{method:'HEAD'})).text(),'');assert.equal((await app.request(path,{method:'POST'})).status,405);
  assert.equal((await app.request(path.replace('engine.wasm','private.env'))).status,404);
  writeFileSync(join(root,release.id,'engine.wasm'),'tampered');const broken=new Hono();registerEngineArtifacts(broken,{root,releases:[release]});assert.equal((await broken.request(path)).status,503);
 }finally{rmSync(root,{recursive:true,force:true})}
});
