import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {once} from 'node:events';import {createHash} from 'node:crypto';
import {createMediaPreviewGateway} from '../scripts/renpy-media-preview-gateway.mjs';
test('preview movie gateway verifies copies, serves exact ranges and exposes no unregistered resource or private API',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wvn-movie-')),source=path.join(root,'source.zip'),target=path.join(root,'game.zip');fs.writeFileSync(source,'original-archive');fs.writeFileSync(target,'converted-archive');const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const receipt={schema:1,player:'renpy-v50789-1',originalArchiveUnchanged:true,sourceArchive:source,sourceArchiveSHA256:hash(source),sourceArchiveBytes:16,targetArchive:target,targetArchiveSHA256:hash(target),targetArchiveBytes:17};
 const gateway=createMediaPreviewGateway(receipt);gateway.listen(0,'127.0.0.1');await once(gateway,'listening');const origin='http://127.0.0.1:'+gateway.address().port,p='/__player/resource/renpy-v50789-1/game.zip';
 try{
  let r=await fetch(origin+p);assert.equal(await r.text(),'converted-archive');const etag=r.headers.get('etag');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('access-control-allow-origin'),'*');
  r=await fetch(origin+p,{method:'HEAD'});assert.equal(r.headers.get('content-length'),'17');assert.equal(await r.text(),'');
  for(const [range,body] of [['bytes=0-3','conv'],['bytes=-7','archive'],['bytes=10-','archive']]){r=await fetch(origin+p,{headers:{Range:range}});assert.equal(r.status,206);assert.equal(await r.text(),body)}
  for(const range of ['bytes=17-','bytes=9-1','bytes=-0','bytes=0-1,3-4'])assert.equal((await fetch(origin+p,{headers:{Range:range}})).status,416);
  assert.equal((await fetch(origin+p,{headers:{'if-none-match':etag}})).status,304);
  r=await fetch(origin+p,{headers:{Range:'bytes=0-3','if-range':'"other"'}});assert.equal(r.status,200);assert.equal(await r.text(),'converted-archive');
  for(const privatePath of ['/api/me','/account','/__player/resource/test/.env','/__player/resource/test/%252e%252e/x'])assert.equal((await fetch(origin+privatePath)).status,404);
  assert.equal((await fetch(origin+p,{method:'POST'})).status,405);
  assert.equal((await fetch(origin+'/__player/resource/renpy-v1286-1/renpy.js',{headers:{Cookie:'secret',Authorization:'secret'}})).status,404);
  assert.equal(fs.readFileSync(source,'utf8'),'original-archive');fs.writeFileSync(target,'tampered-artifact');assert.throws(()=>createMediaPreviewGateway(receipt),/Archive differs/);
 }finally{gateway.closeAllConnections();await new Promise(r=>gateway.close(r));fs.rmSync(root,{recursive:true,force:true})}
});
