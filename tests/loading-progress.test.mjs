import {test} from 'node:test';import assert from 'node:assert/strict';
const loading=await import('../public/ons/loading.mjs').catch(()=>({}));
const required=name=>{assert.equal(typeof loading[name],'function',name+' must be implemented');return loading[name]};

test('only measured totals produce a percentage and malformed bridge progress is ignored',()=>{
 const validate=required('validateLoadingProgress'),percent=required('loadingPercent');
 assert.equal(percent(validate({type:'loading-progress',stage:'downloading',loaded:25,total:100})),25);
 assert.equal(percent(validate({type:'loading-progress',stage:'initializing',percent:99})),null);
 assert.equal(percent({stage:'downloading',loaded:120,total:100}),null);
 for(const value of [{stage:'ready'},{stage:'downloading',loaded:3,total:2},{stage:'downloading',loaded:NaN,total:10},{stage:'downloading',loaded:1,total:Infinity},{stage:'failed',message:'x'.repeat(301)}])assert.equal(validate({type:'loading-progress',...value}),null);
 assert.equal(validate({type:'status',stage:'downloading'}),null);
});
test('native progress ends at engine startup and never invents overall completion',()=>{
 let now=0;const messages=[],report=required('createLoadingReporter')(x=>messages.push(x),{now:()=>now});
 report.phase('connecting');report.engine({type:'status',text:'Downloading data... (25/100)'});
 assert.equal(loading.loadingPercent(messages.at(-1)),25);
 now=1000;report.engine({type:'dependencies',remaining:2});assert.equal(messages.at(-1).stage,'initializing');assert.equal(loading.loadingPercent(messages.at(-1)),null);
 report.complete();const count=messages.length;report.engine({type:'status',text:'Downloading (50/100)'});report.fail('late failure');assert.equal(messages.length,count);
});
test('download updates are bounded but a final measured chunk is delivered',()=>{
 let now=0;const messages=[],r=required('createLoadingReporter')(x=>messages.push(x),{now:()=>now});
 r.download('game',1,100);for(let i=2;i<90;i++)r.download('game',i,100);assert.equal(messages.length,1);
 r.download('game',100,100);assert.equal(loading.loadingPercent(messages.at(-1)),100);
 r.fail('网络中断');r.download('game',2,100);assert.equal(messages.at(-1).stage,'failed');
});
test('request observation leaves fetch responses and native XHR callbacks intact and can be removed',async()=>{
 const bytes=new Uint8Array([1,2,3]),response=new Response(bytes),pending=Promise.resolve(response),owner={};
 const calls=[],messages=[],report=required('createLoadingReporter')(x=>messages.push(x));
 class XHR extends EventTarget{open(...args){calls.push(['open',...args]);return 7}send(body){calls.push(['send',body]);return 9}}
 const originalFetch=function(...args){assert.equal(this,owner);calls.push(['fetch',...args]);return pending},open=XHR.prototype.open,send=XHR.prototype.send;
 const win={fetch:originalFetch,XMLHttpRequest:XHR};const restore=required('observeStartupRequests')(win,report,url=>typeof url==='string'&&url.startsWith('/game/')?'game':null);
 assert.equal(win.fetch.call(owner,'/game/data',{credentials:'omit'}),pending);assert.equal(await pending,response);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
 const xhr=new XHR();let nativeProgress=0;xhr.addEventListener('progress',()=>nativeProgress++);assert.equal(xhr.open('GET','/game/archive'),7);assert.equal(xhr.send(bytes),9);
 const event=Object.assign(new Event('progress'),{loaded:50,total:100,lengthComputable:true});xhr.dispatchEvent(event);assert.equal(nativeProgress,1);assert.equal(loading.loadingPercent(messages.at(-1)),50);
 xhr.dispatchEvent(new Event('loadend'));restore();assert.equal(win.fetch,originalFetch);assert.equal(XHR.prototype.open,open);assert.equal(XHR.prototype.send,send);
});

test('a fetch-only environment can remove observation without an XMLHttpRequest prototype',()=>{
 const win={fetch:()=>Promise.resolve(new Response('ok'))},original=win.fetch;
 const report=required('createLoadingReporter')(()=>{}),restore=required('observeStartupRequests')(win,report,()=>null);
 assert.doesNotThrow(restore);assert.equal(win.fetch,original);
});
