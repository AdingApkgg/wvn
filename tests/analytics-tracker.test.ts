import test from 'node:test';import assert from 'node:assert/strict';
import {PublicTracker} from '../src/analytics/tracker.ts';
const site='123e4567-e89b-42d3-a456-426614174000';
test('delayed tracker queues public events only and drops them when entering a private page',()=>{
 const sent:unknown[]=[],tracker={track:(x:unknown)=>sent.push(x)};let ready:typeof tracker|undefined;
 const t=new PublicTracker(site,'wvn.test',()=>ready);
 t.navigate('/4/?session=secret#slot');t.event('like',true,'/4/');t.navigate('/account');ready=tracker;t.flush();assert.equal(sent.length,0);
 t.navigate('/4/');assert.equal(sent.length,1);assert(!JSON.stringify(sent).includes('secret'));
 t.navigate('/4/?other=private');assert.equal(sent.length,1);
 t.event('favorite',true,'/99/');assert.equal(sent.length,1);
 t.event('favorite',true,'/4/');assert.equal(sent.length,2);
 t.navigate('/s/opaque');t.event('like',true,'/4/');assert.equal(sent.length,2);
});
test('navigation counts path changes and a broken tracker never breaks reader actions',()=>{
 const sent:unknown[]=[],t=new PublicTracker(site,'wvn.test',()=>({track:(x:unknown)=>sent.push(x)}));
 t.navigate('/');t.navigate('/4/');t.navigate('/4/');t.navigate('/');assert.equal(sent.length,3);
 const broken=new PublicTracker(site,'wvn.test',()=>({track:()=>{throw Error('blocked')}}));assert.doesNotThrow(()=>{broken.navigate('/4/');broken.event('reading_start',undefined,'/4/')});
});
