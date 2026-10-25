import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadEngineRegistry,validateEngineRegistry,engineSummary} from '../src/engines/registry.ts';
import {players} from '../public/player/registry.mjs';

test('every existing version retains its engine and save identity while releases group exact artifacts',()=>{
 const registry=loadEngineRegistry();assert.equal(registry.bindings.length,79);
 for(const player of players){const binding=registry.bindings.find(b=>b.versionId===player.versionId)!;assert.equal(binding.playerId,player.id);assert.equal(binding.legacyEngine,player.engine);assert.ok(binding.saveCompatibilityId.includes(player.versionId));}
 const wasm=new Set(registry.releases.flatMap(r=>r.files.filter(f=>f.path.endsWith('.wasm')).map(f=>f.sha256)));
 assert.equal(wasm.size,5);assert.equal(registry.releases.filter(r=>r.kind==='Artemis').length,27);assert.equal(registry.releases.filter(r=>r.kind==='RenPy').length,2);
});
test('registry rejects missing, duplicate, mixed or relabelled legacy bindings',()=>{
 const original=loadEngineRegistry();
 for(const change of [(r:any)=>r.bindings.pop(),(r:any)=>r.bindings.push(r.bindings[0]),(r:any)=>r.bindings[0].releaseId=r.bindings.find((b:any)=>b.playerId.startsWith('artemis'))!.releaseId,(r:any)=>r.bindings[0].legacyEngine='a'.repeat(64),(r:any)=>r.bindings[0].saveCompatibilityId='shared']){
  const candidate=structuredClone(original);change(candidate);assert.throws(()=>validateEngineRegistry(candidate));
 }
 const candidate=structuredClone(original);candidate.releases[0].files[0].path='../private';assert.throws(()=>validateEngineRegistry(candidate));
});
test('private summary never claims imported engines have verified source builds',()=>{
 const summary=engineSummary();assert.equal(summary.versions,79);assert.equal(summary.emscriptenVersions,68);
 assert(summary.releases.every(r=>r.sourceCapability==='imported-prebuilt'));
 assert.doesNotMatch(JSON.stringify(summary),/\/home\/|token|secret|ssh/i);
});
