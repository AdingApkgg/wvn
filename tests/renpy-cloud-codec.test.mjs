import {test} from 'node:test';import assert from 'node:assert/strict';
import * as codec from '../public/ons/cloud.mjs';
const legacy={id:'clannad',versionId:'version',engine:'a'.repeat(64)},target={...legacy,engineReleaseId:'renpy-'+'b'.repeat(64),saveCompatibilityId:'legacy:version:'+legacy.engine};
const snap={schema:1,pilot:'clannad',files:[{path:'a.save',data:new Uint8Array([1,0,255]),mtime:1609459200000}]};
test('v2 cloud records actual writer and rejects implicit legacy and sibling restores',async()=>{
 const old=await codec.packSnapshot(snap,legacy),fresh=await codec.packSnapshot(snap,target),meta=JSON.parse(await fresh.files[0].blob.text());
 assert.equal(meta.schema,2);assert.equal(meta.format,'wvn-engine-cloud');assert.equal(meta.releaseId,target.engineReleaseId);assert.equal(meta.engine,undefined);
 assert.deepEqual(await codec.unpackSnapshot(fresh.files,target),snap);
 for(const t of [legacy,{...target,engineReleaseId:'renpy-'+'c'.repeat(64)},{...target,saveCompatibilityId:'other'},{...target,versionId:'other'}])await assert.rejects(()=>codec.unpackSnapshot(fresh.files,t));
 await assert.rejects(()=>codec.unpackSnapshot(old.files,target));
 assert.deepEqual(await codec.copyLegacySnapshot(old.files,target),snap);
 await assert.rejects(()=>codec.copyLegacySnapshot(fresh.files,target));
 const oldMeta=JSON.parse(await old.files[0].blob.text());assert.equal(oldMeta.schema,1);assert.equal(oldMeta.engine,legacy.engine);assert.equal(oldMeta.releaseId,undefined);
 await assert.rejects(()=>codec.packSnapshot(snap,{...target,engineReleaseId:'bad'}));
});
test('draft identity and link scope distinguish original and new runtime',()=>{
 assert.notEqual(codec.cloudScope('owner','version'),codec.cloudScope('owner','version',target.engineReleaseId));
 assert.equal(codec.cloudScope('owner','version'),JSON.stringify(['owner','version']));
 const d={owner:'owner',pilot:legacy.id,version:legacy.versionId};
 assert(codec.matchesCloudDraft(d,'owner',legacy));assert(!codec.matchesCloudDraft(d,'owner',target));
 assert(codec.matchesCloudDraft({...d,engineReleaseId:target.engineReleaseId},'owner',target));
 assert(!codec.matchesCloudDraft({...d,engineReleaseId:target.engineReleaseId},'other',target));
});
