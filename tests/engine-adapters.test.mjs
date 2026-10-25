import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryStorage,storageSnapshot,restoreStorage,installMemoryPersistence} from '../public/player/adapters.mjs';

test('WebStorage methods and property access retain exact strings and isolated keys',()=>{
 const changes=[];const s=createMemoryStorage(()=>changes.push(true));
 s.setItem('project_sf','%7B%22a%22%3A1%7D');s.project_tyrano_data='raw-compressed';
 assert.equal(s.getItem('project_sf'),'%7B%22a%22%3A1%7D');assert.equal(s.length,2);assert.equal(s.key(1),'project_tyrano_data');
 const files=storageSnapshot(s,123);const other=createMemoryStorage();restoreStorage(other,files);
 assert.equal(other.project_tyrano_data,'raw-compressed');assert.equal(other.getItem('missing'),null);
 delete s.project_sf;assert.equal(s.length,1);assert.equal(changes.length,3);
 assert.throws(()=>restoreStorage(other,[{path:'storage/invalid.json',data:new TextEncoder().encode('broken')}]),/storage/i);
});
test('persistence mounting restores before populate, retains mtime, and waits for durable acknowledgement',async()=>{
 const nodes=new Map();const FS={mount(type,opts,path){this.lastType=type;return{}},mkdirTree(){},writeFile(p,data){nodes.set(p,{data:new Uint8Array(data),mtime:new Date(0)})},utime(p,a,m){nodes.get(p).mtime=new Date(m)},readdir(p){return ['.','..',...Array.from(nodes.keys()).filter(k=>k.startsWith(p+'/')).map(k=>k.slice(p.length+1))]},lstat(p){return {mode:0x8000,size:nodes.get(p).data.length,mtime:nodes.get(p).mtime}},isDir(mode){return mode===0x4000},isFile(mode){return mode===0x8000},readFile(p){return nodes.get(p).data},syncfs(){throw Error('native IndexedDB must never run')}};
 const IDBFS={},MEMFS={};let release;const writes=[];
 const capture=installMemoryPersistence({FS,IDBFS,MEMFS,mount:'/save',files:[{path:'a.sav',data:new Uint8Array([7]),mtime:123456}],persist:files=>{writes.push(files);return new Promise(r=>release=r)}});
 FS.mount(IDBFS,{},'/save');assert.equal(FS.lastType,MEMFS);
 await new Promise((r,j)=>FS.syncfs(true,e=>e?j(e):r()));assert.equal(nodes.get('/save/a.sav').mtime.getTime(),123456);
 let acknowledged=false;FS.syncfs(false,e=>{assert.equal(e,undefined);acknowledged=true});await Promise.resolve();assert.equal(acknowledged,false);assert.equal(writes[0][0].mtime,123456);
 release();await new Promise(r=>setTimeout(r,0));assert.equal(acknowledged,true);assert.deepEqual(capture()[0].data,new Uint8Array([7]));
 assert.throws(()=>FS.mount(IDBFS,{},'/other'),/mount/i);
});

test('sandbox save thumbnail preserves callback and promise APIs without creating another document',async()=>{
 const {sandboxThumbnail}=await import('../public/player/adapters.mjs');
 const lines=[];const canvas={width:0,height:0,getContext:()=>({fillRect(){},fillText(text){lines.push(text)},set fillStyle(v){},set font(v){}})};let callbacks=0;
 const render=sandboxThumbnail(()=>canvas,()=>({title:'Test',text:'Actual native checkpoint'}));
 assert.equal(await render({}, {onrendered(value){assert.equal(value,canvas);callbacks++}}),canvas);
 assert.equal(callbacks,1);assert.ok(lines.join('').includes('Actual native checkpoint'));assert.ok(lines.some(line=>line.includes('文字预览')));
});

test('RenPy legacy migration selects only this game directory and shared save-signing tokens',async()=>{
 const {belongsToLegacyScope}=await import('../public/player/adapters.mjs');
 const entry={runtimeKind:'RenPy',legacyDirectory:'eden-1667270632'};
 assert.equal(belongsToLegacyScope(entry,'eden-1667270632/1-1-LT1.save'),true);
 assert.equal(belongsToLegacyScope(entry,'tokens/security_keys.txt'),true);
 assert.equal(belongsToLegacyScope(entry,'other-game/1-1-LT1.save'),false);
 assert.equal(belongsToLegacyScope(entry,'eden-1667270632-other/persistent'),false);
 assert.throws(()=>belongsToLegacyScope({runtimeKind:'RenPy'},'any/persistent'),/scope/i);
 assert.equal(belongsToLegacyScope({runtimeKind:'Artemis'},'save1.dat'),true);
});

test('opaque media requests opt into anonymous CORS before URL assignment so WebGL textures remain readable',async()=>{
 const {installAnonymousMedia}=await import('../public/player/adapters.mjs');const requests=[];
 class Media{set src(v){requests.push({url:v,cors:this.crossOrigin})}get src(){return ''}setAttribute(name,value){this[name]=value}}
 class Image extends Media{};Object.defineProperty(Image.prototype,'src',Object.getOwnPropertyDescriptor(Media.prototype,'src'));
 const win={HTMLImageElement:Image,HTMLMediaElement:Media,Audio:Media,MutationObserver:class{observe(){}disconnect(){}},document:{querySelectorAll:()=>[]}};
 installAnonymousMedia(win);const image=new win.HTMLImageElement();image.src='texture.png';const audio=new win.Audio('voice.ogg');
 assert.deepEqual(requests,[{url:'texture.png',cors:'anonymous'},{url:'voice.ogg',cors:'anonymous'}]);assert.ok(audio instanceof Media);
});

test('audited RenPy game-local saves are captured separately from shared tokens and retain paths and dates',()=>{
 const nodes=new Map(),FS={mount(){return{}},mkdirTree(){},writeFile(p,data){nodes.set(p,{data:new Uint8Array(data),mtime:new Date(0)})},utime(p,a,m){nodes.get(p).mtime=new Date(m)},readdir(p){return ['.','..',...Array.from(nodes.keys()).filter(k=>k.startsWith(p+'/')).map(k=>k.slice(p.length+1))]},lstat(p){return {mode:0x8000,size:nodes.get(p).data.length,mtime:nodes.get(p).mtime}},isDir:()=>false,isFile:()=>true,readFile(p){return nodes.get(p).data}};
 const IDBFS={},MEMFS={},capture=installMemoryPersistence({FS,IDBFS,MEMFS,mount:'/home/.renpy',extraMount:'/game/saves',files:[{path:'security.txt',data:new Uint8Array([1]),mtime:12},{path:'game-saves/1-LT1.save',data:new Uint8Array([9,8]),mtime:34}],persist:async()=>{}});FS.mount(IDBFS,{},'/home/.renpy');
 assert.deepEqual(capture().map(f=>({path:f.path,mtime:f.mtime,data:[...f.data]})),[{path:'security.txt',mtime:12,data:[1]},{path:'game-saves/1-LT1.save',mtime:34,data:[9,8]}]);assert.equal(nodes.has('/home/.renpy/game-saves/1-LT1.save'),false);
});

test('dynamic stylesheets opt into anonymous CORS before href assignment for native cssRules access',async()=>{
 const {installAnonymousMedia}=await import('../public/player/adapters.mjs');const requests=[];
 class Media{set src(v){}get src(){return ''}setAttribute(name,value){this[name]=value}}
 class Image extends Media{};Object.defineProperty(Image.prototype,'src',Object.getOwnPropertyDescriptor(Media.prototype,'src'));
 class Link{set href(value){requests.push({value,cors:this.crossOrigin})}get href(){return ''}setAttribute(name,value){this[name]=value}}
 const win={HTMLImageElement:Image,HTMLMediaElement:Media,HTMLLinkElement:Link,Audio:Media,MutationObserver:class{observe(){}disconnect(){}},document:{querySelectorAll:()=>[]}};
 installAnonymousMedia(win);new Link().href='tyrano/tyrano.css';assert.deepEqual(requests,[{value:'tyrano/tyrano.css',cors:'anonymous'}]);
});

test('Artemis native menu uses a held right mouse button instead of Escape hiding dialogue',async()=>{
 const {requestNativeMenu}=await import('../public/player/adapters.mjs');const events=[];
 class Event{constructor(type,options){this.type=type;Object.assign(this,options)}}
 const canvas={focus(){},getBoundingClientRect:()=>({x:10,y:20,width:800,height:450}),dispatchEvent:e=>events.push(e)};
 await requestNativeMenu({MouseEvent:Event,KeyboardEvent:Event},'Artemis',canvas);
 assert.deepEqual(events.map(e=>[e.type,e.button,e.buttons]),[['mousedown',2,2],['mouseup',2,0]]);
 assert.equal(events[0].clientX,410);assert.equal(events[0].clientY,245);
});

test('one audited voice-repeat plugin can restore an unvoiced native checkpoint without mutating stored input',async()=>{
 const {prepareTyranoLoad}=await import('../public/player/adapters.mjs');
 const data={stat:{f:{voice_repeat:{enable:false,pm:''}}},current_order_index:20};
 const fixed=prepareTyranoLoad('tyrano-v49795-1',data);
 assert.equal(fixed.stat.f.voice_repeat.pm.storage,'');assert.equal(data.stat.f.voice_repeat.pm,'');
 assert.equal(prepareTyranoLoad('tyrano-v36555-1',data),data);
 const voiced={stat:{f:{voice_repeat:{pm:{storage:'_voice/test.ogg'}}}}};assert.equal(prepareTyranoLoad('tyrano-v49795-1',voiced),voiced);
});

test('voice-repeat compatibility leaves the native load call chain untouched',async()=>{
 const {installTyranoLoadCompatibility}=await import('../public/player/adapters.mjs');
 const original={data:[{stat:{f:{voice_repeat:{pm:''}}}}]};const load=function nativeLoad(){};
 const menu={getSaveData:()=>original,loadGameData:load};const win={tyrano:{plugin:{kag:{menu}}}};
 installTyranoLoadCompatibility(win,'tyrano-v49795-1');
 assert.equal(menu.loadGameData,load);assert.equal(menu.getSaveData().data[0].stat.f.voice_repeat.pm.storage,'');assert.equal(original.data[0].stat.f.voice_repeat.pm,'');
});
