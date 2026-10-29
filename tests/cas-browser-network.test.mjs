import {test} from 'node:test';import assert from 'node:assert/strict';
import * as api from '../ops/b2/cas-provenance.mjs';
const sha='a'.repeat(64),row={path:'x',key:'opaque',url:'https://wg-b2.saop.cc/'+sha+'.bin',sha256:sha,bytes:1,contentType:'image/png'};
const expected={schema:1,delivery:'cas',pilot:'sample',versionId:'version',inventorySha256:'b'.repeat(64),resourceOrigin:'https://wg-b2.saop.cc',resources:[row],engineResources:{id:'engine',files:[]}};
test('CAS browser provenance compares independent identity and exact metadata, then literal request URLs',()=>{
 assert.equal(typeof api.validateBrowserManifest,'function');assert.equal(typeof api.validateBrowserResourceURL,'function');
 const urls=api.validateBrowserManifest(expected,structuredClone(expected));assert.equal(api.validateBrowserResourceURL(row.url,urls).sha256,sha);
 for(const url of ['https://wg-b2.saop.cc/__player/resource/x/a.png','https://wg-b2.saop.cc/__cas-canary/'+sha+'.bin',row.url+'?key=x','https://wg-b2.saop.cc/'+'c'.repeat(64)+'.bin'])assert.throws(()=>api.validateBrowserResourceURL(url,urls));
 const changed=structuredClone(expected);changed.resources[0].sha256='c'.repeat(64);assert.throws(()=>api.validateBrowserManifest(expected,changed));
});
