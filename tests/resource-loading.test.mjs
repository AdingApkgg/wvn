import {test} from 'node:test';import assert from 'node:assert/strict';
const api=await import('../public/ons/resource-loading.mjs').catch(()=>({}));
const required=name=>{assert.equal(typeof api[name],'function',name);return api[name]};
test('resource batches continue after startup and finish despite throttling or concurrent requests',()=>{
 const events=[],r=required('createResourceReporter')(e=>events.push(e),{now:()=>0});
 const a=r.begin();a.progress(20,100);assert.equal(events.length,0);r.activate();assert.equal(events.at(-1).active,1);
 const b=r.begin();assert.equal(events.at(-1).loaded,undefined);b.progress(10,50);a.end();assert.equal(events.at(-1).active,1);assert.equal(events.at(-1).total,150);b.end();assert.equal(events.at(-1).active,0);
 const c=r.begin();assert.equal(events.at(-1).loaded,undefined);c.end(true);assert.equal(events.at(-1).failed,true);const count=events.length;r.close();r.begin().end();assert.equal(events.length,count);
});
test('untrusted resource packets cannot invent totals or active requests',()=>{
 const validate=required('validateResourceProgress');assert.deepEqual(validate({type:'resource-progress',active:2,loaded:10,total:100,percent:99}),{active:2,loaded:10,total:100});
 for(const data of [{active:-1},{active:Infinity},{active:1.5},{active:1,loaded:20,total:10},{active:1,loaded:NaN,total:10},{active:0,failed:'yes'},{active:1,total:10}])assert.equal(validate({type:'resource-progress',...data}),null);
});
test('fetch keeps its Promise and Response, and stays active through body consumption',async()=>{
 const events=[],r=required('createResourceReporter')(e=>events.push(e));r.activate();let finish;
 const body=new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));finish=()=>c.close()}}),response=new Response(body),promise=Promise.resolve(response);
 const win={fetch:()=>promise};const stop=required('observeResourceRequests')(win,{phase(){}},()=> 'game',r);
 assert.equal(win.fetch('/game'),promise);assert.equal(await promise,response);await Promise.resolve();const read=response.arrayBuffer();assert.equal(events.at(-1).active,1);finish();assert.deepEqual(new Uint8Array(await read),new Uint8Array([1,2]));await Promise.resolve();assert.equal(events.at(-1).active,0);stop();
});
test('stream chunks have measured progress without replacing reader promises, bytes or callbacks',async()=>{
 const events=[],r=required('createResourceReporter')(e=>events.push(e));r.activate();let c;const response=new Response(new ReadableStream({start(x){c=x}}),{headers:{'Content-Length':'4'}});
 const win={fetch:()=>Promise.resolve(response)},stop=required('observeResourceRequests')(win,{phase(){}},()=> 'game',r);await win.fetch('/game');const reader=response.body.getReader();c.enqueue(new Uint8Array([1,2]));assert.deepEqual((await reader.read()).value,new Uint8Array([1,2]));assert.equal(events.at(-1).loaded,2);assert.equal(events.at(-1).total,4);c.enqueue(new Uint8Array([3,4]));c.close();await reader.read();await reader.read();assert.equal(events.at(-1).active,0);stop();
});
test('fetch and body failures settle; observer removal never replaces later fetch hooks',async()=>{
 const events=[],r=required('createResourceReporter')(e=>events.push(e));r.activate();const win={fetch:()=>Promise.reject(Error('offline'))},stop=required('observeResourceRequests')(win,{phase(){}},()=> 'game',r);
 await assert.rejects(win.fetch('/game'),/offline/);assert.equal(events.at(-1).active,0);assert.equal(events.at(-1).failed,true);const later=()=>{};win.fetch=later;stop();assert.equal(win.fetch,later);
});
test('XHR counts independent completion and abort without changing native handlers or return values',()=>{
 class XHR extends EventTarget{open(){return 7}send(){return 9}}
 const events=[],r=required('createResourceReporter')(e=>events.push(e));r.activate();const win={XMLHttpRequest:XHR},original=XHR.prototype.send,stop=required('observeResourceRequests')(win,{phase(){},download(){}},()=> 'game',r);
 const a=new XHR(),b=new XHR();assert.equal(a.open('GET','/a'),7);assert.equal(a.send(),9);b.open('GET','/b');b.send();let native=0;a.addEventListener('progress',()=>native++);a.dispatchEvent(Object.assign(new Event('progress'),{loaded:1,total:2,lengthComputable:true}));assert.equal(native,1);a.dispatchEvent(new Event('loadend'));assert.equal(events.at(-1).active,1);b.dispatchEvent(new Event('abort'));b.dispatchEvent(new Event('loadend'));assert.equal(events.at(-1).active,0);assert.equal(events.at(-1).failed,true);stop();assert.equal(XHR.prototype.send,original);
});
test('body read failures clear the batch without replacing the original read promise',async()=>{
 const events=[],r=required('createResourceReporter')(e=>events.push(e));r.activate();let fail;const response=new Response(new ReadableStream({start(c){fail=()=>c.error(Error('body interrupted'))}}));
 const original=response.arrayBuffer,win={fetch:()=>Promise.resolve(response)},stop=required('observeResourceRequests')(win,{phase(){}},()=> 'game',r);await win.fetch('/game');const read=response.arrayBuffer();fail();await assert.rejects(read,/body interrupted/);assert.equal(events.at(-1).active,0);assert.equal(events.at(-1).failed,true);assert.equal(response.arrayBuffer,original);stop();
});
test('image observation composes with anonymous media and preserves native load handlers',()=>{
 class Image extends EventTarget {get src(){return this.url}set src(value){this.crossOrigin='anonymous';this.url=value}setAttribute(name,value){if(name==='src')this.src=value}}
 const descriptor=Object.getOwnPropertyDescriptor(Image.prototype,'src'),events=[],r=required('createResourceReporter')(e=>events.push(e));r.activate();const win={HTMLImageElement:Image},stop=required('observeResourceRequests')(win,{phase(){}},url=>url?.startsWith('/game/')?'game':null,r);
 const image=new Image();let loaded=0;image.addEventListener('load',()=>loaded++);image.src='/game/scene.png';assert.equal(image.crossOrigin,'anonymous');assert.equal(image.src,'/game/scene.png');assert.equal(events.at(-1).active,1);image.dispatchEvent(new Event('load'));assert.equal(loaded,1);assert.equal(events.at(-1).active,0);image.setAttribute('src','/game/next.png');image.dispatchEvent(new Event('error'));assert.equal(events.at(-1).failed,true);stop();assert.deepEqual(Object.getOwnPropertyDescriptor(Image.prototype,'src'),descriptor);
});
test('media with preload none shows progress only when loading actually starts',()=>{
 class Media extends EventTarget{preload='none';get src(){return this.url}set src(value){this.url=value}setAttribute(name,value){this[name]=value}}
 const events=[],r=required('createResourceReporter')(e=>events.push(e));r.activate();const win={HTMLMediaElement:Media},stop=required('observeResourceRequests')(win,{phase(){}},url=>url?.startsWith('/game/')?'game':null,r),audio=new Media();audio.src='/game/voice.ogg';assert.equal(events.at(-1).active,0);audio.dispatchEvent(new Event('loadstart'));assert.equal(events.at(-1).active,1);audio.dispatchEvent(new Event('loadeddata'));assert.equal(events.at(-1).active,0);stop();
});
