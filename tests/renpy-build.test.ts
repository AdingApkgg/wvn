import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadEngineRegistry} from '../src/engines/registry.ts';
import {validateRecipe} from '../src/engines/build.ts';
const fixture=()=>({schema:1,id:'renpy-8.2.1',kind:'RenPy',sdk:'emsdk-3.1.24-linux-x64',source:{url:'https://github.com/renpy/renpy.git',commit:'1a30d4dd8eb5d0f21ac8550703439db05fde0cc8'},buildSystem:{url:'https://github.com/renpy/renpy-build.git',commit:'992db0ebeef20cf752a29eda9df503377e80e1b2'},pygameSdl2:{url:'https://github.com/renpy/pygame_sdl2.git',commit:'4fadf87b8c3e9d607b97709d3bbf3df6a7fab102'},inputs:{path:'engines/locks/renpy-8.2.1-inputs.json',sha256:'a'.repeat(64)},patches:[],outputs:['renpy-pre.js','renpy.js','renpy.wasm','renpy.data']});
const registry=loadEngineRegistry;
test('RenPy source recipe requires its complete JS/WASM/data group and exact source pins',()=>{
 const r=validateRecipe(fixture(),registry());assert.equal(r.kind,'RenPy');
 for(const change of [(r:any)=>r.source.commit='master',(r:any)=>r.buildSystem.commit='renpy-8.2.1.24030407',(r:any)=>r.pygameSdl2.url='https://example.test/source.git',(r:any)=>r.sdk='emsdk-6.0.10-linux-x64',(r:any)=>r.outputs=r.outputs.filter((x:string)=>!x.endsWith('.data')),(r:any)=>r.outputs.push('worker.js'),(r:any)=>r.outputs.push('renpy.data'),(r:any)=>r.command='make all',(r:any)=>r.inputs.path='../secret']){const value=fixture();change(value);assert.throws(()=>validateRecipe(value,registry()))}
});
test('adding RenPy recipe does not reinterpret old ONS recipe or legacy bindings',()=>{
 const r=loadEngineRegistry(),old=JSON.stringify(r.bindings);assert.equal(validateRecipe(JSON.parse(readFileSync('engines/recipes/onsyuri.json','utf8')),r).kind,'ONS');assert.equal(JSON.stringify(loadEngineRegistry().bindings),old)
});

test('SDK environment handles official EM_CONFIG-relative Node paths without evaluating config',async()=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {sdkEnvironment}=await import('../src/engines/toolchains.ts');const root=mkdtempSync(join(tmpdir(),'wvn-sdk-node-'));
 const declaration="emsdk_path = os.path.dirname(os.getenv('EM_CONFIG')).replace('\\\\', '/')";
 try{
  writeFileSync(join(root,'.emscripten'),declaration+"\nNODE_JS = emsdk_path + '/node/24.19.0_64bit/bin/node'\n");assert(sdkEnvironment(root).PATH?.includes(root+'/node/24.19.0_64bit/bin'));
  writeFileSync(join(root,'.emscripten'),`NODE_JS = '${root}/node/bin/node'\n`);assert(sdkEnvironment(root).PATH?.includes(root+'/node/bin'));
  writeFileSync(join(root,'.emscripten'),declaration+"\nNODE_JS = emsdk_path + '/../external/node'\n");assert.throws(()=>sdkEnvironment(root),/escapes/);
  writeFileSync(join(root,'.emscripten'),"emsdk_path = '/usr'\nNODE_JS = emsdk_path + '/bin/node'\n");assert.throws(()=>sdkEnvironment(root),/Node runtime/);
  writeFileSync(join(root,'.emscripten'),"NODE_JS = some_function()\n");assert.throws(()=>sdkEnvironment(root),/Node runtime/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
