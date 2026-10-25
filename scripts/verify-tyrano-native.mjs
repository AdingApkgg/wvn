import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {otherPlayers} from '../public/player/registry.mjs';
import {previewChromiumOptions} from './lib/preview-browser.mjs';
import * as native from './lib/player-native-browser.mjs';
const origin=process.env.WG_PLAYER_URL??'https://localhost:18489',root='reports/player-native';
const ids=process.argv.slice(2),targets=otherPlayers.filter(p=>p.runtimeKind==='Tyrano'&&ids.includes(p.id));
assert.equal(targets.length,ids.length);fs.mkdirSync(root,{recursive:true});
const opts=previewChromiumOptions('state/cloud/tls.crt');opts.executablePath='C:/Program Files/Google/Chrome/Application/chrome.exe';opts.args.push('--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required');
const browser=await chromium.launch(opts),results=[];
async function click(page){const b=await page.locator('iframe').boundingBox();await page.mouse.click(b.x+b.width*.5,b.y+b.height*.55,{delay:150});await page.waitForTimeout(900)}
async function ready(page){let frame;for(let n=0;n<100;n++){frame=native.frameOf(page);if(frame)break;await page.waitForTimeout(100)}await frame.waitForFunction(()=>window.TYRANO?.kag?.ftag?.current_order_index>=0&&window.TYRANO?.kag?.config?.projectID,null,{timeout:60000});return frame}
async function save(frame,slot){await frame.evaluate(slot=>{const menu=TYRANO.kag.menu;menu.snap=null;menu.doSave(slot)},slot);await frame.waitForFunction(slot=>!!TYRANO.kag.menu.getSaveData().data[slot]?.save_date,slot,{timeout:15000});return frame.evaluate(slot=>{const s=TYRANO.kag.menu.getSaveData().data[slot];return{scenario:s.stat.current_scenario,index:s.current_order_index,message:s.stat.current_save_str??s.stat.current_message_str??'',date:s.save_date}},slot)}
async function load(frame,slot,saved){await frame.evaluate(slot=>TYRANO.kag.menu.loadGame(slot),slot);await frame.waitForFunction(saved=>TYRANO.kag.stat.current_scenario===saved.scenario&&(TYRANO.kag.ftag.current_order_index===saved.index||TYRANO.kag.ftag.current_order_index===saved.index+1)&&(TYRANO.kag.stat.current_save_str??TYRANO.kag.stat.current_message_str??'')===saved.message,saved,{timeout:20000})}
try{for(const entry of targets){const context=await browser.newContext({viewport:{width:1280,height:960}}),page=await context.newPage(),errors=[];page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));let record={pilot:entry.id,engine:entry.engine,startedAt:new Date().toISOString()};try{
 await page.goto(origin+entry.route,{waitUntil:'networkidle'});await page.getByRole('button',{name:'开始阅读',exact:true}).click();let frame=await ready(page);await click(page);
 for(let n=0;n<12;n++){
  const button=await frame.evaluate(()=>{for(const e of document.querySelectorAll('[data-event-pm]')){let p;try{p=JSON.parse(e.getAttribute('data-event-pm'))}catch{continue}const b=e.getBoundingClientRect();if(!b.width||!b.height||getComputedStyle(e).visibility==='hidden'||getComputedStyle(e).display==='none')continue;if((p.storage&&!/config|system|title|save|load|backlog|credit|gallery/i.test(p.storage))||(p.target&&!/end|exit|load|save|config|gallery|replay|extra|credit|back|return/i.test(p.target)))return e.getAttribute('data-event-pm')}return null});
  if(button){await page.waitForTimeout(1000);await frame.locator('[data-event-pm]').evaluateAll((els,pm)=>els.find(e=>e.getAttribute('data-event-pm')===pm)?.click(),button);await page.waitForTimeout(2200);break}
  await click(page);
 }
 const a=await save(frame,0);record.checkpointA={scenario:a.scenario,index:a.index};const filesA=await native.nativeFiles(page,entry);await native.writeBackup(page,entry,`${root}/${entry.id}-legacy-original.json`,filesA);
 let b;for(let n=0;n<8;n++){await click(page);b=await frame.evaluate(()=>({scenario:TYRANO.kag.stat.current_scenario,index:TYRANO.kag.ftag.current_order_index}));if(b.scenario!==a.scenario||b.index>a.index+1)break}
 assert(b.scenario!==a.scenario||b.index>a.index+1,'Actual native checkpoint must advance');
 await load(frame,0,a);await click(page);const second=await save(frame,1),filesB=await native.nativeFiles(page,entry);fs.writeFileSync(`${root}/${entry.id}-native-fixture.json`,JSON.stringify(filesB));
 await native.stop(page);const head=await native.localHead(page,entry.id);assert.deepEqual(native.describe(head.snapshot.files),native.describe(filesB));
 await page.getByRole('button',{name:'开始阅读',exact:true}).click();frame=await ready(page);
 const slots=await frame.evaluate(()=>TYRANO.kag.menu.getSaveData().data.slice(0,2).map(s=>({scenario:s.stat?.current_scenario,index:s.current_order_index,date:s.save_date})));assert.deepEqual(slots,[a,second].map(s=>({scenario:s.scenario,index:s.index,date:s.date})));
 await load(frame,0,a);assert.deepEqual(errors,[]);await native.stop(page);
 record={...record,status:'passed',nativeSave:true,nativeLoadRestoresEarlierCheckpoint:true,nativeLoadAfterRestart:true,slotsRetained:2,localHistoryRetained:head.history.length,durableExactBytesMtime:true,textThumbnail:true,errors};
 }catch(e){record={...record,status:'failed',error:e.message,errors};await page.screenshot({path:`${root}/${entry.id}-failure.jpg`,type:'jpeg',quality:40}).catch(()=>{})}finally{record.finishedAt=new Date().toISOString();fs.writeFileSync(`${root}/${entry.id}-native-case.json`,JSON.stringify(record,null,2));results.push(record);console.log(JSON.stringify(record));await context.close()}
}}finally{await browser.close()}
if(results.some(r=>r.status!=='passed'))process.exitCode=1;
