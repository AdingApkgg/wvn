import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeInputSpec,validatePlayerName,installNativeInput} from '../public/player/native-input.mjs';

test('only the audited name prompt consumes a player supplied string',()=>{
 const win={prompt(){throw Error('Native modal must not be called')}};
 assert.equal(nativeInputSpec('artemis-v27448-1'),null);
 assert.equal(nativeInputSpec('artemis-v25170-1').label,'主角名字');
 installNativeInput(win,'artemis-v25170-1',{playerName:'  小明  '});
 assert.equal(win.prompt('请输入你的名字',''),'小明');
 assert.throws(()=>win.prompt('Unexpected prompt'),/未经适配/);
 const original=()=>null,other={prompt:original};
 installNativeInput(other,'artemis-v27448-1',{});assert.equal(other.prompt,original);
});

test('invalid names stop before starting while names remain data',()=>{
 for(const value of [undefined,null,{},'', '   ','x'.repeat(33),'a\nb','a\u0000b','a\u007fb'])assert.throws(()=>validatePlayerName(value),/名字/);
 assert.equal(validatePlayerName("小明 ' \\\""),"小明 ' \\\"");
 const win={};installNativeInput(win,'artemis-v25170-1',{playerName:'玩家'});
 assert.throws(()=>installNativeInput({},'artemis-v25170-1',{}),/名字/);
 assert.equal(win.prompt('请输入你的名字'),'玩家');
});
