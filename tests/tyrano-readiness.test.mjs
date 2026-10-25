import test from 'node:test';import assert from 'node:assert/strict';import{isTyranoReady,waitForTyranoReady}from'../public/player/adapters.mjs';
test('Tyrano startup waits for configuration and parsed scenario tags',async()=>{
 const ready={config:{projectID:'story'},stat:{current_scenario:'first.ks'},ftag:{current_order_index:0,array_tag:[{name:'text'}]}};
 assert.equal(isTyranoReady(undefined),false);assert.equal(isTyranoReady({...ready,ftag:{current_order_index:0,array_tag:[]}}),false);assert.equal(isTyranoReady({...ready,config:{}}),false);assert.equal(isTyranoReady(ready),true);
 let kag={...ready,ftag:{current_order_index:-1,array_tag:[]}};setTimeout(()=>{kag=ready},20);await waitForTyranoReady(()=>kag,{timeout:200,interval:5});
 await assert.rejects(waitForTyranoReady(()=>({...ready,ftag:{current_order_index:0,array_tag:[]}}),{timeout:30,interval:5}),/就绪/);
});
