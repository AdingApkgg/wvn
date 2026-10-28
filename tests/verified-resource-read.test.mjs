import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {readVerifiedResource,fetchResourceHeaders} from '../scripts/lib/read-verified-resource.mjs';

const payload=Buffer.alloc(65536,0x37),sha256=createHash('sha256').update(payload).digest('hex');
async function serverFor(t,respond){
 const server=createServer(respond);server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));return 'http://127.0.0.1:'+server.address().port;
}
function truncated(response){response.writeHead(200,{'content-length':String(payload.length)});response.flushHeaders();response.write(payload.subarray(0,128));setTimeout(()=>response.destroy(),25);}
test('a connection reset after HTTP 200 headers retries the entire verified body',async t=>{
 let requests=0,headers=0;
 const url=await serverFor(t,(_req,res)=>{requests++;if(requests===1)truncated(res);else res.end(payload);});
 const bytes=await readVerifiedResource(async({signal})=>{const response=await fetch(url,{signal});if(response.status===200)headers++;return response;},{sha256,attempts:3,timeoutMs:1000});
 assert.deepEqual(bytes,payload);assert.equal(requests,2);assert.equal(headers,2,'The first attempt must have received a real 200 response before its body was interrupted');
});
test('an actual checksum mismatch is rejected without retry or accepting different bytes',async t=>{
 let requests=0;const url=await serverFor(t,(_req,res)=>{requests++;res.end(Buffer.alloc(payload.length,0x38));});
 await assert.rejects(readVerifiedResource(({signal})=>fetch(url,{signal}),{sha256,attempts:3,timeoutMs:1000}),/checksum/);assert.equal(requests,1);
});
test('missing objects are terminal instead of retried as transient network failures',async t=>{
 let requests=0;const url=await serverFor(t,(_req,res)=>{requests++;res.writeHead(404);res.end('missing');});
 await assert.rejects(readVerifiedResource(({signal})=>fetch(url,{signal}),{sha256,attempts:3,timeoutMs:1000}),/404/);assert.equal(requests,1);
});
test('repeated body interruptions stop after the configured number of attempts',async t=>{
 let requests=0;const url=await serverFor(t,(_req,res)=>{requests++;truncated(res);});
 await assert.rejects(readVerifiedResource(({signal})=>fetch(url,{signal}),{sha256,attempts:3,timeoutMs:1000}));assert.equal(requests,3);
});
test('a stalled body times out per attempt and can recover on the next request',{timeout:3000},async t=>{
 let requests=0;const url=await serverFor(t,(_req,res)=>{requests++;if(requests===1){res.writeHead(200,{'content-length':String(payload.length)});res.flushHeaders();res.write(payload.subarray(0,128));}else res.end(payload);});
 const bytes=await readVerifiedResource(({signal})=>fetch(url,{signal}),{sha256,attempts:3,timeoutMs:80});assert.deepEqual(bytes,payload);assert.equal(requests,2);
});
test('caller cancellation ends the current read without starting another attempt',async t=>{
 let requests=0;const controller=new AbortController();
 const url=await serverFor(t,(_req,res)=>{requests++;res.writeHead(200,{'content-length':String(payload.length)});res.flushHeaders();res.write(payload.subarray(0,128));setTimeout(()=>controller.abort(Error('User cancelled')),20);});
 await assert.rejects(readVerifiedResource(({signal})=>fetch(url,{signal}),{sha256,attempts:3,timeoutMs:1000,signal:controller.signal}),/cancel/i);assert.equal(requests,1);
});
test('a header timeout does not truncate a body that is still downloading',async t=>{
 const url=await serverFor(t,(_req,res)=>{res.writeHead(200,{'content-length':String(payload.length)});res.flushHeaders();res.write(payload.subarray(0,128));setTimeout(()=>res.end(payload.subarray(128)),200);});
 const response=await fetchResourceHeaders(url,{timeoutMs:60});assert.deepEqual(Buffer.from(await response.arrayBuffer()),payload);
});
test('waiting for response headers remains bounded',async t=>{
 const url=await serverFor(t,(_req,res)=>{setTimeout(()=>res.end(payload),200);});
 await assert.rejects(fetchResourceHeaders(url,{timeoutMs:60}),/timeout|abort/i);
});
test('caller cancellation still aborts the body after response headers',async t=>{
 const controller=new AbortController();const url=await serverFor(t,(_req,res)=>{res.writeHead(200,{'content-length':String(payload.length)});res.flushHeaders();res.write(payload.subarray(0,128));setTimeout(()=>controller.abort(Error('User cancelled body')),30);});
 const response=await fetchResourceHeaders(url,{timeoutMs:500,signal:controller.signal});await assert.rejects(response.arrayBuffer(),/cancel/i);
});
