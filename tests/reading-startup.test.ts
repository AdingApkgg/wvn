import test from 'node:test';import assert from 'node:assert/strict';
import {consumeStartupNotice} from '../src/analytics/startup.ts';
test('only a bound structured engine startup can be consumed once',()=>{
 const c={nonce:'nonce-1',started:false};
 assert.equal(consumeStartupNotice({type:'status',message:'游戏已启动',nonce:c.nonce,pilot:'game'},c,'game'),false);
 assert.equal(consumeStartupNotice({type:'started',nonce:'old',pilot:'game'},c,'game'),false);
 assert.equal(consumeStartupNotice({type:'started',nonce:c.nonce,pilot:'other'},c,'game'),false);
 assert.equal(consumeStartupNotice({type:'started',nonce:c.nonce,pilot:'game'},c,'game'),true);
 assert.equal(consumeStartupNotice({type:'started',nonce:c.nonce,pilot:'game'},c,'game'),false);
});
