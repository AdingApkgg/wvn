import{test}from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{mkdtempSync,mkdirSync,writeFileSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{createMediaProjection}from'../src/player/media.server.ts';
test('video projection preserves original bytes, verifies both artifacts and serves MP4 with ranges',async()=>{
 const root=mkdtempSync(join(tmpdir(),'wg-media-')),games=join(root,'games'),media=join(root,'media'),source=Buffer.from('original-codec'),converted=Buffer.from('compatible-video'),sha=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
 mkdirSync(join(games,'atri','movie'),{recursive:true});mkdirSync(media);writeFileSync(join(games,'atri/movie/logo.ogv'),source);const file=sha(source)+'.mp4';writeFileSync(join(media,file),converted);
 const doc={schema:1,entries:[{id:'artemis-v27448-1',path:'movie/logo.ogv',file,sourceSHA256:sha(source),sourceBytes:source.length,sha256:sha(converted),bytes:converted.length}]};
 try{const project=createMediaProjection(games,media,doc),r=(await project(new Request('https://localhost/a',{headers:{Range:'bytes=0-3'}}),'artemis-v27448-1','movie/logo.ogv'))!;assert.equal(r.status,206);assert.equal(r.headers.get('Content-Type'),'video/mp4');assert.equal(await r.text(),'comp');assert.equal(await project(new Request('https://localhost/a'),'artemis-v27448-1','unlisted.ogv'),null);
 writeFileSync(join(media,file),Buffer.from('tampered-content'));const changed=createMediaProjection(games,media,doc);assert.equal((await changed(new Request('https://localhost/a'),'artemis-v27448-1','movie/logo.ogv'))?.status,503);
 assert.throws(()=>createMediaProjection(games,undefined,doc));assert.throws(()=>createMediaProjection(games,media,{schema:1,entries:[{...doc.entries[0],path:'../private.ogv'}]}));
 }finally{rmSync(root,{recursive:true,force:true})}
});
