import {test} from 'node:test';import assert from 'node:assert/strict';
const api=await import('../public/ons/resource-loading.mjs');const loading=await import('../public/ons/loading.mjs');
const required=name=>{assert.equal(typeof api[name],'function',name);return api[name]};
test('transfer speed follows measured bytes and elapsed time, resets for a new batch',()=>{
 let now=0;const meter=required('createTransferMeter')({now:()=>now});assert.deepEqual(meter.sample(0,10000),{bytesLoaded:0,bytesTotal:10000});now=1000;assert.equal(meter.sample(2000,10000).bytesPerSecond,2000);now=1500;assert.equal(meter.sample(4000,10000).bytesPerSecond,4000);now=2500;assert.equal(meter.sample(4000,10000).bytesPerSecond,0);
});
test('unknown totals still report received bytes without inventing percent or total',()=>{
 let now=0;const messages=[],r=api.createResourceReporter(x=>messages.push(x),{now:()=>now});r.activate();const request=r.begin();now=1000;request.progress(2048);assert.equal(messages.at(-1).bytesLoaded,2048);assert.equal(messages.at(-1).total,undefined);assert.equal(messages.at(-1).bytesTotal,undefined);assert.equal(messages.at(-1).bytesPerSecond,2048);request.end();now=1500;const next=r.begin();assert.equal(messages.at(-1).bytesLoaded,undefined);now=2500;next.progress(1024,8192);assert.equal(messages.at(-1).bytesPerSecond,1024);
});
test('byte metrics validate independently of engine progress units and reject unsafe packets',()=>{
 const valid={bytesLoaded:1024,bytesTotal:2048,bytesPerSecond:4096};assert.deepEqual(api.validateResourceProgress({type:'resource-progress',active:1,...valid}),{active:1,...valid});assert.deepEqual(loading.validateLoadingProgress({type:'loading-progress',stage:'downloading',...valid}),{stage:'downloading',...valid});
 for(const metrics of [{bytesLoaded:-1},{bytesLoaded:1,bytesTotal:0},{bytesLoaded:3,bytesTotal:2},{bytesLoaded:NaN},{bytesLoaded:1,bytesPerSecond:Infinity},{bytesLoaded:1,bytesPerSecond:-1},{bytesTotal:10},{bytesPerSecond:5}]){
  assert.equal(api.validateResourceProgress({type:'resource-progress',active:1,...metrics}),null);assert.equal(loading.validateLoadingProgress({type:'loading-progress',stage:'downloading',...metrics}),null);
 }
 const messages=[],report=loading.createLoadingReporter(x=>messages.push(x));report.engine({type:'status',text:'Downloading (1/3)'});assert.equal(messages.at(-1).bytesLoaded,undefined);
});
test('format byte and rate values without turning unknown or invalid data into zeros',()=>{
 const format=required('formatTransferBytes');assert.equal(format(0),'0 B');assert.equal(format(1024),'1 KiB');assert.equal(format(1024*1024*1.5),'1.5 MiB');assert.equal(format(undefined),null);assert.equal(format(NaN),null);
});
test('the ONS streaming consumer returns original bytes and reports unknown-length chunks',async()=>{
 let feed;const response=new Response(new ReadableStream({start(c){feed=c}})),events=[],r=api.createResourceReporter(e=>events.push(e));r.activate();const win={fetch:()=>Promise.resolve(response)},stop=api.observeResourceRequests(win,{phase(){},download(){}},()=> 'game',r);
 const pending=required('readResourceBytes')(await win.fetch('/game/file'));feed.enqueue(new Uint8Array([1,2]));await new Promise(resolve=>setTimeout(resolve,10));assert.equal(events.at(-1).bytesLoaded,2);feed.enqueue(new Uint8Array([3]));feed.close();assert.deepEqual(await pending,new Uint8Array([1,2,3]));assert.equal(events.at(-1).active,0);assert.equal(events.at(-1).bytesLoaded,3);stop();
});
test('XHR reports loaded bytes even when the server does not expose a total length',()=>{
 class XHR extends EventTarget{open(){}send(){}}
 const packets=[],events=[],r=api.createResourceReporter(e=>events.push(e));r.activate();const stop=api.observeResourceRequests({XMLHttpRequest:XHR},{phase(){},download(...args){packets.push(args)}},()=> 'game',r),xhr=new XHR();xhr.open('GET','/game/voice');xhr.send();xhr.dispatchEvent(Object.assign(new Event('progress'),{loaded:1234,total:0,lengthComputable:false}));assert.equal(events.at(-1).bytesLoaded,1234);assert.equal(packets.at(-1)[1],1234);xhr.dispatchEvent(new Event('loadend'));stop();
});
test('compressed streams expose measured decoded bytes without using compressed content length as total',async()=>{
 let feed;const response=new Response(new ReadableStream({start(c){feed=c}}),{headers:{'content-length':'1','content-encoding':'gzip'}}),events=[],r=api.createResourceReporter(e=>events.push(e));r.activate();const source={fetch:()=>Promise.resolve(response)},cleanup=api.observeResourceRequests(source,{phase(){}},()=> 'game',r);const pending=api.readResourceBytes(await source.fetch('/game/compressed'));feed.enqueue(new Uint8Array([1,2,3]));feed.close();assert.deepEqual(await pending,new Uint8Array([1,2,3]));assert.equal(events.at(-1).bytesLoaded,3);assert.equal(events.at(-1).bytesTotal,undefined);cleanup();
});
test('failure never fills missing byte counts with the declared total',()=>{
 const messages=[],r=api.createResourceReporter(x=>messages.push(x));r.activate();const request=r.begin();request.progress(100,10000);request.end(true);assert.equal(messages.at(-1).bytesLoaded,100);assert.equal(messages.at(-1).bytesTotal,10000);assert.equal(messages.at(-1).failed,true);
});
test('waiting for headers does not publish a zero speed or reset the first byte sample',()=>{
 let now=0;const meter=api.createTransferMeter({now:()=>now});now=1000;assert.deepEqual(meter.sample(0,10000),{bytesLoaded:0,bytesTotal:10000});now=1100;assert.equal(meter.sample(2200,10000).bytesPerSecond,2000);
});
