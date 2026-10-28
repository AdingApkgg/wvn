import { test } from "node:test";
import assert from "node:assert/strict";
import * as codec from "../public/ons/cloud.mjs";
import { createAccountService } from "./helpers/accounts.ts";
const target = { id: "clannad", versionId: "legacy-a1a835ec6184bfd5142f454f", engine: "64ed1e7b9e92aa83b8106227d6095b3ab951e2bed75ac4bb8ed43f044737de04" };
const snapshot = { schema: 1 as const, pilot: "clannad", files: [{path:"ENVDATA",data:new Uint8Array([0,255,10]),mtime:1609459200000},{path:"nested/save1.dat",data:new Uint8Array([9,8,7,6]),mtime:946684800000}] };
test("cloud envelope round trips native bytes, paths and dates and rejects wrong target", async () => {
  const packed = await codec.packSnapshot(snapshot, target);
  assert(packed.files.every(f=>f.bytes===f.blob.size && f.bytes<=32*1024**2));
  const restored = await codec.unpackSnapshot(packed.files,target);
  assert.deepEqual(restored,snapshot);
  for(const changed of [{...target,id:"saya"},{...target,versionId:"other"},{...target,engine:"different"}]) await assert.rejects(()=>codec.unpackSnapshot(packed.files,changed));
});
test("cloud envelope refuses tampered bytes and metadata without accepting partial snapshots", async () => {
  const packed=await codec.packSnapshot(snapshot,target);
  const bad=packed.files.map(f=>f.name.endsWith('.bin')?{...f,blob:new Blob([new Uint8Array([1,2,3])])}:f);
  await assert.rejects(()=>codec.unpackSnapshot(bad,target));
  await assert.rejects(()=>codec.unpackSnapshot(packed.files.slice(1),target));
  const manifest=JSON.parse(await packed.files[0].blob.text());manifest.files[0].path='../private';
  await assert.rejects(()=>codec.unpackSnapshot([{...packed.files[0],blob:new Blob([JSON.stringify(manifest)])},...packed.files.slice(1)],target));
  await assert.rejects(()=>codec.packSnapshot({...snapshot,files:[]},target));
});
test("cloud chunks preserve 512 native files and reject envelopes exceeding cloud total quota", async () => {
  const input={schema:1 as const,pilot:'clannad',files:Array.from({length:512},(_,n)=>({path:`slot${n}.dat`,data:new Uint8Array([n%256])}))};
  const packed=await codec.packSnapshot(input,target);assert(packed.files.length<=3);
  assert.deepEqual(await codec.unpackSnapshot(packed.files,target),input);
  await assert.rejects(()=>codec.packSnapshot({schema:1,pilot:'clannad',files:[{path:'a.dat',data:new Uint8Array(32*1024**2)},{path:'b.dat',data:new Uint8Array(32*1024**2)}]},target));
});
test('multipart cloud envelope retains bytes on both sides of the 32 MiB boundary',async()=>{
  const first=new Uint8Array(32*1024**2);first[0]=17;first[first.length-1]=255;
  const input={schema:1 as const,pilot:'clannad',files:[{path:'large.dat',data:first,mtime:1609459200000},{path:'tail.dat',data:new Uint8Array([9,0,8]),mtime:946684800000}]};
  const packed=await codec.packSnapshot(input,target);assert.equal(packed.files.length,3);
  assert.deepEqual(await codec.unpackSnapshot(packed.files,target),input);
});
test("opaque origins cannot read account APIs and custom preview cookies stay separate", async()=>{
  const service=await createAccountService({origin:'https://localhost:18487',database:':memory:',secret:'test-secret-with-more-than-forty-eight-characters-for-ons',cookiePrefix:'__Host-wg-ons-preview'});
  try{
    const r=await service.app.request('https://localhost:18487/api/me',{headers:{origin:'null'}});
    assert.equal(r.status,403);
    assert.equal((await r.json()).code,'ORIGIN_INVALID');
    const options=await service.app.request('https://localhost:18487/api/auth/passkey/generate-authenticate-options');
    assert.match(options.headers.get('set-cookie')??'',/__Host-wg-ons-preview/);
    assert.doesNotMatch(options.headers.get('set-cookie')??'',/__Host-wg\./);
  }finally{service.close()}
});
test("every audited ONS envelope preserves bytes and rejects a sibling version", async () => {
  const {pilots}=await import('../public/ons/registry.mjs');
  for(const [i,p] of pilots.entries()){
    const input={schema:1,pilot:p.id,files:[{path:'save1.dat',data:new Uint8Array([i,255,0]),mtime:1609459200000}]};
    const packed=await codec.packSnapshot(input,p);
    assert.deepEqual(await codec.unpackSnapshot(packed.files,p),input);
    await assert.rejects(()=>codec.unpackSnapshot(packed.files,pilots[(i+1)%pilots.length]));
  }
});
test("security headers survive a trusted framework returning its own Response", async () => {
  const service=await createAccountService({origin:'https://localhost:18487',database:':memory:',secret:'z'.repeat(48)});
  try{
    service.app.get('/trusted-framework',()=>new Response('framework page',{headers:{'content-type':'text/html'}}));
    service.app.get('/trusted-sandbox',()=>new Response('sandbox',{headers:{'content-security-policy':"sandbox allow-scripts; frame-ancestors 'self'",'cache-control':'no-store'}}));
    for(const path of ['/trusted-framework','/trusted-sandbox']){
      const r=await service.app.request('https://localhost:18487'+path);
      assert.equal(r.headers.get('cross-origin-opener-policy'),'same-origin');
      assert.equal(r.headers.get('cross-origin-embedder-policy'),'require-corp');
      assert.equal(r.headers.get('x-content-type-options'),'nosniff');
      if(path.endsWith('sandbox'))assert.match(r.headers.get('content-security-policy')!,/sandbox allow-scripts/);
      else assert.match(r.headers.get('content-security-policy')!,/frame-ancestors 'none'/);
    }
  }finally{service.close()}
});
