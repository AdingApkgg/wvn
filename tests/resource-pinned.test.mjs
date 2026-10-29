import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readPinnedResource} from '../public/player/resource-location.mjs';
const data=new TextEncoder().encode('abcdefghijklmnopqrstuvwxyz'),sha256=createHash('sha256').update(data).digest('hex');
const row={url:'https://wg-b2.saop.cc/'+sha256+'.bin',sha256,bytes:data.length};
test('CAS packages recover a failed chunk without ETag and only return verified complete bytes',async()=>{
 const ranges=[];let interrupted=false;
 const bytes=await readPinnedResource(row,{chunkBytes:8,retryDelay:async()=>{},fetcher:async(url,options)=>{
  assert.equal(url,row.url);const range=options.headers.get('range');ranges.push(range);const [,a,b]=/^bytes=(\d+)-(\d+)$/.exec(range),start=Number(a),end=Number(b);
  if(start===8&&!interrupted){interrupted=true;return new Response(new ReadableStream({start(c){c.enqueue(data.slice(8,10));c.error(Error('connection reset'))}}),{status:206,headers:{'content-range':'bytes 8-15/26'}})}
  return new Response(data.slice(start,end+1),{status:206,headers:{'content-range':`bytes ${start}-${end}/26`}});
 }});
 assert.deepEqual(bytes,data);assert.deepEqual(ranges,['bytes=0-7','bytes=8-15','bytes=8-15','bytes=16-23','bytes=24-25']);
});
test('wrong range and modified same-size bytes fail closed',async()=>{
 await assert.rejects(readPinnedResource(row,{chunkBytes:8,retries:0,fetcher:async()=>new Response(data.slice(0,8),{status:206,headers:{'content-range':'bytes 1-8/26'}})}),/range/);
 await assert.rejects(readPinnedResource(row,{chunkBytes:99,retries:0,fetcher:async()=>new Response(new Uint8Array(26))}),/checksum/);
});
test('server ignoring Range may return a full package only after exact integrity verification',async()=>{
 assert.deepEqual(await readPinnedResource(row,{chunkBytes:8,fetcher:async()=>new Response(data)}),data);
 await assert.rejects(readPinnedResource({...row,url:'https://evil.invalid/'+sha256+'.bin'},{fetcher:()=>{throw Error('must not request')}}),/Untrusted/);
});
test('decoded full bodies use manifest size when CORS hides the wire encoding header',async()=>{
 assert.deepEqual(await readPinnedResource(row,{fetcher:async()=>new Response(data,{headers:{'content-length':'12'}})}),data);
});
