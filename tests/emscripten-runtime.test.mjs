import{test}from'node:test';import assert from'node:assert/strict';
import{createEmscriptenDriver,captureFilesystem,resolveEngineResource}from'../public/player/emscripten.mjs';

test('runtime preparation runs once after data preload and before the native initialized hook',()=>{
 const calls=[],win={},driver=createEmscriptenDriver({kind:'RenPy',prepareRuntime:value=>{assert.equal(value.FS.ready,true);calls.push('runtime');}});
 driver.installGlobal(win);win.Module={FS:{ready:true},onRuntimeInitialized(){calls.push('native');}};
 win.Module.onRuntimeInitialized();win.Module.onRuntimeInitialized();assert.deepEqual(calls,['runtime','native','native']);
});

test('factory driver preserves hooks, context and return values while exposing lifecycle',async()=>{
 const calls=[],states=[],owner={};const options={preRun:function(arg){calls.push(['pre',this,arg]);return 7},onRuntimeInitialized:function(arg){calls.push(['ready',this,arg]);return 9},onAbort:function(reason){calls.push(['abort',this,reason]);return 11}};
 const driver=createEmscriptenDriver({kind:'ONS',status:s=>states.push(s)});
 const instance=await driver.startFactory(async config=>{assert.equal(config.preRun.call(owner,'a'),7);assert.equal(config.onRuntimeInitialized.call(owner,'b'),9);return config},options);
 assert.equal(instance,options);assert.deepEqual(calls.map(x=>[x[0],x[2]]),[['pre','a'],['ready','b']]);assert(calls.every(x=>x[1]===owner));assert(states.includes('initializing'));
 assert.equal(instance.onAbort.call(owner,'bad'),11);assert.equal(driver.state,'failed');assert.throws(()=>driver.running(),/failed/);
});
test('global Module replacement and loader callback reinsertion preserve filesystem-before-mount order',()=>{
 const order=[],win={},driver=createEmscriptenDriver({kind:'Artemis',prepareFilesystem:()=>order.push('fs')});
 driver.installGlobal(win);win.Module={preRun:[()=>order.push('game')]};driver.beforeScript();
 // 已核验的旧加载器按反向执行 preRun。
 for(const hook of [...win.Module.preRun].reverse())hook();assert.deepEqual(order,['fs','game']);
 driver.beforeScript();assert.equal(win.Module.preRun.length,2);
 const second={preRun:()=>order.push('replacement')};win.Module=second;driver.beforeScript();for(const hook of [...second.preRun].reverse())hook();assert.equal(order.filter(x=>x==='fs').length,1);
});
test('registered engine resources reject traversal and cross-origin requests',()=>{
 const resources={baseURL:'https://localhost/__engine/release/',files:['engine.wasm','engine.worker.js']};
 assert.equal(resolveEngineResource('engine.wasm',resources),'https://localhost/__engine/release/engine.wasm');
 for(const path of ['../secret','https://evil.invalid/x.wasm','/api/me','%2e%2e/private','other.wasm'])assert.throws(()=>resolveEngineResource(path,resources));
});
test('shared filesystem capture preserves paths, bytes and mtime and rejects special files',()=>{
 let mode=32768;const FS={readdir:()=>['.','..','save.dat'],lstat:()=>({mode,size:2,mtime:new Date(1234)}),isDir:m=>m===16384,isFile:m=>m===32768,readFile:()=>new Uint8Array([8,9])};
 assert.deepEqual(captureFilesystem(FS,[{path:'/save',prefix:''}]),[{path:'save.dat',data:new Uint8Array([8,9]),mtime:1234}]);
 assert.deepEqual(captureFilesystem(FS,[{path:'/game/saves',prefix:'game-saves'}])[0].path,'game-saves/save.dat');
 mode=40960;assert.throws(()=>captureFilesystem(FS,[{path:'/save',prefix:''}]),/type|limit/i);
});

test('hook reassignment preserves the replacement instead of recursively invoking wrappers',()=>{
 const win={},calls=[],driver=createEmscriptenDriver({kind:'RenPy'});driver.installGlobal(win);
 win.Module.onRuntimeInitialized=()=>calls.push('old');const copy={...win.Module};win.Module=copy;win.Module.onRuntimeInitialized=()=>calls.push('new');win.Module.onRuntimeInitialized();assert.deepEqual(calls,['new']);
});

test('candidate exports cannot be mistaken for legacy backups or another engine release',async()=>{
 const {exportBackup,importBackup}=await import('../public/ons/storage.mjs');
 const snapshot={schema:1,pilot:'saya',files:[{path:'save1.dat',data:new Uint8Array([4,5]),mtime:12}]},id='ons-'+ 'a'.repeat(64);
 const candidate=await exportBackup(snapshot,id);
 await assert.rejects(importBackup(candidate,'saya'),/引擎|版本|备份/);
 await assert.rejects(importBackup(candidate,'saya',{releaseId:'ons-'+'b'.repeat(64)}),/引擎|版本|备份/);
 assert.deepEqual((await importBackup(candidate,'saya',{releaseId:id})).files[0].data,snapshot.files[0].data);
 const old=await exportBackup(snapshot);await assert.rejects(importBackup(old,'saya',{releaseId:id}),/复制|引擎|版本/);
 assert.deepEqual((await importBackup(old,'saya',{releaseId:id,allowLegacyCopy:true})).files[0].data,snapshot.files[0].data);
});

test('chained hook assignments retain each previous callback without recursion',()=>{
 const win={},calls=[],owner={},driver=createEmscriptenDriver({kind:'RenPy'});driver.installGlobal(win);
 win.Module.onRuntimeInitialized=function(value){assert.equal(this,owner);calls.push('base:'+value);return 7;};
 const first=win.Module.onRuntimeInitialized;win.Module.onRuntimeInitialized=function(value){calls.push('outer');return first.call(this,value)+1;};
 const second=win.Module.onRuntimeInitialized;win.Module.onRuntimeInitialized=function(value){calls.push('last');return second.call(this,value)+1;};
 assert.equal(win.Module.onRuntimeInitialized.call(owner,'x'),9);assert.deepEqual(calls,['last','outer','base:x']);assert.equal(driver.state,'initialized');
});
test('global preRun assignments during engine loading always retain the one-time filesystem hook',()=>{
 const win={},calls=[],driver=createEmscriptenDriver({kind:'Artemis',prepareFilesystem:()=>calls.push('fs')});driver.installGlobal(win);driver.beforeScript();
 win.Module.preRun=[()=>calls.push('array')];for(const fn of [...win.Module.preRun].reverse())fn();assert.deepEqual(calls,['fs','array']);
 win.Module.preRun=()=>calls.push('function');for(const fn of [...win.Module.preRun].reverse())fn();assert.deepEqual(calls,['fs','array','function']);
});

test('RenPy candidate backups remain scoped to their family release and game',async()=>{
 const {exportBackup,importBackup}=await import('../public/ons/storage.mjs');const s={schema:1,pilot:'renpy-v1286-1',files:[{path:'test.save',data:new Uint8Array([4,5]),mtime:12}]},id='renpy-'+'a'.repeat(64),text=await exportBackup(s,id);
 assert.equal((await importBackup(text,s.pilot,{releaseId:id})).files[0].path,'test.save');await assert.rejects(importBackup(text,s.pilot,{releaseId:'ons-'+'a'.repeat(64)}));await assert.rejects(importBackup(text,s.pilot));
});


test('RenPy session pins its whole engine group and rejects partial or foreign releases',async()=>{
 const {engineResourcesForSession}=await import('../public/player/emscripten.mjs');const release={id:'renpy-'+'a'.repeat(64),kind:'RenPy',files:['renpy-pre.js','renpy.js','renpy.wasm','renpy.data'].map(path=>({path,sha256:'b'.repeat(64)}))};
 const resources=engineResourcesForSession(release,'RenPy','https://localhost:18557');assert.equal(resolveEngineResource('renpy.data',resources),'https://localhost:18557/__engines/resource/'+release.id+'/renpy.data');assert.equal(engineResourcesForSession(undefined,'RenPy','https://localhost:18557'),undefined);
 for(const mutate of [r=>r.files.pop(),r=>r.files[3]=r.files[0],r=>r.id='ons-'+'a'.repeat(64),r=>r.files[0].path='../renpy-pre.js',r=>r.files[0].sha256='invalid']){const value=structuredClone(release);mutate(value);assert.throws(()=>engineResourcesForSession(value,'RenPy','https://localhost:18557'))}
 assert.throws(()=>engineResourcesForSession(release,'Artemis','https://localhost:18557'));assert.throws(()=>engineResourcesForSession(release,'RenPy','https://evil.test/path/'));assert.throws(()=>resolveEngineResource('game.zip',resources));
});

test('candidate backup release family must match the game even when envelope fields agree',async()=>{
 const {exportBackup,importBackup}=await import('../public/ons/storage.mjs');const snapshot={schema:1,pilot:'saya',files:[{path:'save1.dat',data:new Uint8Array([4]),mtime:1}]},id='renpy-'+'a'.repeat(64);await assert.rejects(exportBackup(snapshot,id),/引擎|版本/);const legacy=JSON.parse(await exportBackup(snapshot));const text=JSON.stringify({...legacy,format:'wvn-engine-save',schema:2,releaseId:id});await assert.rejects(importBackup(text,snapshot.pilot,{releaseId:id}),/引擎|版本/);
});

test('download observers preserve upstream status/dependency hooks and cannot abort the engine',()=>{
 const events=[],calls=[],owner={},win={};
 const driver=createEmscriptenDriver({kind:'RenPy',progress:event=>events.push(event)});driver.installGlobal(win);
 win.Module.setStatus=function(text){assert.equal(this,owner);calls.push(text);return 42};
 win.Module.monitorRunDependencies=function(left){assert.equal(this,owner);return left+1};
 assert.equal(win.Module.setStatus.call(owner,'Downloading data... (25/100)'),42);
 assert.equal(win.Module.monitorRunDependencies.call(owner,3),4);
 assert.deepEqual(events,[{type:'status',text:'Downloading data... (25/100)'},{type:'dependencies',remaining:3}]);
 const previous=win.Module.setStatus;win.Module.setStatus=function(text){return previous.call(this,text)+1};
 assert.equal(win.Module.setStatus.call(owner,'Running...'),43);assert.deepEqual(calls,['Downloading data... (25/100)','Running...']);
 const noisy=createEmscriptenDriver({kind:'ONS',progress:()=>{throw Error('Observer offline')}});
 return noisy.startFactory(async config=>{config.setStatus('Downloading...');return config},{}).then(()=>assert.equal(noisy.state,'initialized'));
});

test('direct CDN engines reuse already verified WASM and package bytes without a second download',()=>{
 const wasm=new Uint8Array([0,97,115,109]),data=new Uint8Array([1,2,3,4]);
 const driver=createEmscriptenDriver({kind:'RenPy',engineBytes:new Map([['renpy.wasm',wasm],['renpy.data',data]])}),win={};driver.installGlobal(win);
 win.Module={getPreloadedPackage:()=> 'original-fallback'};
 assert.equal(win.Module.wasmBinary,wasm);
 assert.equal(win.Module.getPreloadedPackage('https://wg-b2.saop.cc/__engines/resource/release/renpy.data',4),data.buffer);
 assert.equal(win.Module.getPreloadedPackage('game.zip',77),'original-fallback');
 assert.throws(()=>win.Module.getPreloadedPackage('renpy.data',9),/size/);
});
