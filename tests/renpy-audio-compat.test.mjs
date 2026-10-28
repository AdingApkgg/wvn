import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {prepareRenpyAudio} from '../public/player/renpy-audio.mjs';

// 来自 RenPy 1a30d4dd8eb5d0f21ac8550703439db05fde0cc8；夹具保留上游 MIT 声明。
const original=readFileSync(new URL('./fixtures/renpy/audio-8.2.1.js',import.meta.url),'utf8');
const release='renpy-5b572ebfa6248cac249cab61f698c967cac82b7d225da7515971b383d0f0a3cf';
async function adapted(){
 const api={prepareRenpyAudio};
 let source=original,writes=0;
 const FS={readFile(path,options){assert.equal(path,'/renpy/common/_audio.js');assert.equal(options.encoding,'utf8');return source;},writeFile(path,text){assert.equal(path,'/renpy/common/_audio.js');source=text;writes++;}};
 const applied=api.prepareRenpyAudio({FS},release);return {api,FS,applied,get source(){return source;},get writes(){return writes;}};
}
function stopFor(source,debug=false){
 const start=source.indexOf('let video_stop = (c) => {'),end=source.indexOf('\n};',start)+3;assert(start>=0&&end>start);
 const logs=[],context=vm.createContext({DEBUG_OUT:debug,console:{debug:(...args)=>logs.push(args.join(' '))}});
 vm.runInContext(source.slice(start,end)+'\nthis.stop = video_stop;',context);return {stop:context.stop,logs};
}
function channel(playing,queued=null){let removed=0,disconnected=0;const video={src:'opening.mp4',parentElement:{removeChild(element){assert.equal(element,video);removed++;}}};return {value:{playing,queued,video_el:video,video_size:[1280,720],media_source:{disconnect(){disconnected++;}}},get removed(){return removed;},get disconnected(){return disconnected;}};}

test('the captured engine reproduces the missing video statistics exception',()=>{
 const {stop}=stopFor(original),c=channel({file:'opening.ogv',started:null});assert.throws(()=>stop(c.value),/reading '1'/);assert.equal(c.removed,0);
});
test('file-backed playback without video statistics still stops and releases its media element',async()=>{
 const a=await adapted(),c=channel({file:'opening.ogv',started:null});
 assert.doesNotThrow(()=>stopFor(a.source).stop(c.value));
 assert.equal(c.value.playing,null);assert.equal(c.value.queued,null);assert.equal(c.value.video_el,null);assert.equal(c.value.media_source,null);assert.equal(c.value.video_size,null);assert.equal(c.removed,1);assert.equal(c.disconnected,1);
});
test('video statistics remain intact and the next queued clip is retained',async()=>{
 const a=await adapted(),q={draw_stats:[10,3,100,200],file_stats:[7,2,100,300]},next={url:'next.mp4'},c=channel(q,next),run=stopFor(a.source);
 run.stop(c.value);assert.equal(c.value.playing,next);assert.equal(c.value.queued,null);assert.equal(c.removed,0);assert.equal(c.disconnected,0);assert(run.logs[0].includes('draw_fps=30.0'));assert(run.logs[0].includes('renpy_fps=10.0'));assert.deepEqual(q.draw_stats,[10,3,100,200]);
});
test('the compatibility edit is scoped to the captured release, idempotent, and rejects unknown source shapes',async()=>{
 const a=await adapted();assert.equal(a.applied,true);assert.equal(a.writes,1);assert.equal(a.api.prepareRenpyAudio({FS:a.FS},release),false);assert.equal(a.writes,1);
 const FS={readFile(){throw Error('Unrelated runtime must not be read');}};assert.equal(a.api.prepareRenpyAudio({FS},'renpy-'+ 'a'.repeat(64)),false);
 assert.throws(()=>a.api.prepareRenpyAudio({FS:{readFile:()=>original.replace('const draw_fps =','const other_fps ='),writeFile(){throw Error('Unknown source must not be changed');}}},release),/shape|source/i);
});
