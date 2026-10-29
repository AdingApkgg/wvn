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
test('rejected response validation still writes failed JSON and closes the context',async()=>{
 assert.equal(typeof api.finishBrowserCase,'function');
 const {mkdtempSync,writeFileSync,readFileSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const directory=mkdtempSync(join(tmpdir(),'cas-evidence-'));let closed=0;
 try{
  const record={status:'passed',id:'sample'},failure=Promise.reject(Error('Independent metadata differs'));failure.catch(()=>{});
  await api.finishBrowserCase({record,tasks:[failure],write:record=>writeFileSync(join(directory,'case.json'),JSON.stringify(record)),close:async()=>{closed++}});
  const saved=JSON.parse(readFileSync(join(directory,'case.json'),'utf8'));assert.equal(saved.status,'failed');assert.match(saved.error,/Independent metadata differs/);assert.equal(closed,1);
  await assert.rejects(api.finishBrowserCase({record:{status:'passed'},tasks:[],write:()=>{throw Error('disk error')},close:async()=>{closed++}}),/disk error/);assert.equal(closed,2);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
