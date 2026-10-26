import {test} from 'node:test';import assert from 'node:assert/strict';
import {cloudAcceptanceHost} from '../scripts/lib/cloud-acceptance-host.mjs';
test('cloud acceptance only runs on the known remote host or named remote QA container',()=>{
 const a=cloudAcceptanceHost({},'localhost','/home/wvn/wvn-emscripten-20261025');assert.equal(a.proxy,'http://127.0.0.1:11090');assert.equal(a.certificate,'preview.crt');
 const b=cloudAcceptanceHost({},'wvn-cloud-browser-qa','/work');assert.equal(b.proxy,'http://127.0.0.1:20172');assert.equal(b.certificate,'/qa/preview.crt');assert.equal(b.origin,'https://localhost:18601');assert.equal(b.concurrency,1);assert.throws(()=>cloudAcceptanceHost({WG_CLOUD_CONCURRENCY:'2'},'wvn-cloud-browser-qa','/work'));
 for(const [host,cwd] of [['developer-mac','/work'],['arch','/work'],['localhost','/Users/developer/Code/temp'],['wvn-cloud-browser-qa','/tmp']])assert.throws(()=>cloudAcceptanceHost({},host,cwd));
 for(const origin of ['https://wg.saop.cc','http://localhost:18601','https://localhost:18601/private'])assert.throws(()=>cloudAcceptanceHost({WG_CLOUD_ORIGIN:origin},'wvn-cloud-browser-qa','/work'));
});
