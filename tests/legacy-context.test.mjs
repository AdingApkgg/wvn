import{test}from'node:test';import assert from'node:assert/strict';import{retireLegacyWorkers}from'../public/player/legacy-context.mjs';
test('upgrade retires only known game workers without clearing browser save databases',async()=>{
 const calls=[],registration=scope=>({scope,unregister:async()=>{calls.push(scope);return true}});
 const scopes=['https://wg.saop.cc/eden/','https://wg.saop.cc/'+encodeURIComponent('万华镜系列')+'/'+encodeURIComponent('万华镜1')+'/','https://wg.saop.cc/','https://else.invalid/eden/'];
 await retireLegacyWorkers({getRegistrations:async()=>scopes.map(registration)},'https://wg.saop.cc');assert.deepEqual(calls,scopes.slice(0,2));
 assert.deepEqual(await retireLegacyWorkers(undefined,'https://wg.saop.cc'),[]);
 await assert.rejects(()=>retireLegacyWorkers({getRegistrations:async()=>[{scope:scopes[0],unregister:async()=>false}]},'https://wg.saop.cc'));
});
