import{test}from'node:test';import assert from'node:assert/strict';
import{createEmscriptenDriver,captureFilesystem,resolveEngineResource}from'../public/player/emscripten.mjs';

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
