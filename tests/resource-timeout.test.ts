import test from 'node:test';import assert from 'node:assert/strict';import {createServer,get} from 'node:http';import {configureResourceTimeout} from '../src/server/resource-timeout.ts';
test('a slow resource response survives while an account request keeps the short deadline',async()=>{
 const server=createServer((req,res)=>{configureResourceTimeout(req,res,{defaultMs:80,resourceMs:1500});setTimeout(()=>{if(!res.destroyed)res.end('complete')},400)});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert(address&&typeof address!=='string');
 const port=address.port;
 async function request(path:string,method='GET'){return new Promise<string>((resolve,reject)=>{const req=get({hostname:'127.0.0.1',port,path,method},res=>{let text='';res.on('data',s=>text+=s);res.on('end',()=>resolve(text));res.on('error',reject)});req.on('error',reject)})}
 try{const [resource,account,post]=await Promise.allSettled([request('/__engines/resource/release/renpy.wasm'),request('/api/me'),request('/__engines/resource/release/renpy.wasm','POST')]);assert.equal(resource.status,'fulfilled');if(resource.status==='fulfilled')assert.equal(resource.value,'complete');assert.equal(account.status,'rejected');assert.equal(post.status,'rejected')}finally{await new Promise<void>(resolve=>server.close(()=>resolve()))}
});
