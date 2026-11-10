import {test} from 'node:test';
import assert from 'node:assert/strict';
import {coverLayout} from '../src/lib/cover-layout.ts';

test('portrait and square metadata keep distinct proportions',()=>{
 assert.deepEqual(coverLayout({width:600,height:900}),{ratio:2/3,wide:false});
 assert.deepEqual(coverLayout({width:400,height:400}),{ratio:1,wide:false});
});
test('loaded dimensions override stale metadata and determine wide layout',()=>{
 assert.deepEqual(coverLayout({width:600,height:900},3),{ratio:3,wide:true});
 assert.deepEqual(coverLayout({width:1200,height:400},1),{ratio:1,wide:false});
});
test('logo remains a horizontal card even when the loaded image is square',()=>{
 assert.deepEqual(coverLayout({kind:'logo',width:200,height:200}),{ratio:1,wide:true});
 assert.deepEqual(coverLayout({kind:'logo'},1),{ratio:1,wide:true});
});
test('missing dimensions use category fallbacks before an image loads',()=>{
 assert.deepEqual(coverLayout({kind:'logo'}),{ratio:2.4,wide:true});
 assert.deepEqual(coverLayout({kind:'promotion'}),{ratio:16/9,wide:false});
 assert.deepEqual(coverLayout(null),{ratio:2/3,wide:false});
 assert.deepEqual(coverLayout(undefined),{ratio:2/3,wide:false});
});
test('very narrow artwork keeps the established padded minimum',()=>{
 assert.deepEqual(coverLayout({width:100,height:500}),{ratio:.5,wide:false});
});
