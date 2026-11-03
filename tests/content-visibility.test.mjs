import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installContentVisibility} from '../public/player/content-visibility.mjs';

test('资格遮挡会静音并阻止引擎自行恢复音频，恢复时不销毁存档或实例',async()=>{
 let paused=0,resumed=0,mediaPlays=0;
 class Context{state='running';async suspend(){this.state='suspended'}async resume(){this.state='running'}}
 class Media{paused=false;pause(){this.paused=true}async play(){mediaPlays++;this.paused=false}}
 const media=new Media();
 const scope={AudioContext:Context,HTMLMediaElement:Media,document:{querySelectorAll:()=>[media],documentElement:{}},g_onsyuri_module:{pauseMainLoop(){paused++},resumeMainLoop(){resumed++}}};
 const control=installContentVisibility(scope);const audio=new scope.AudioContext();
 await control.setVisible(false);assert.equal(audio.state,'suspended');assert.equal(media.paused,true);assert.equal(paused,1);
 await audio.resume();await media.play();assert.equal(audio.state,'suspended');assert.equal(media.paused,true);
 const late=new scope.AudioContext();await Promise.resolve();assert.equal(late.state,'suspended');
 await control.setVisible(true);assert.equal(audio.state,'running');assert.equal(media.paused,false);assert.equal(resumed,1);assert.equal(mediaPlays,1);
});
test('已播放但未挂到DOM的音频也会暂停，只恢复本次暂停的媒体',async()=>{
 class Media{paused=true;pause(){this.paused=true}async play(){this.paused=false}}
 const scope={HTMLMediaElement:Media,document:{querySelectorAll:()=>[],documentElement:{}}};
 const control=installContentVisibility(scope),playing=new Media(),idle=new Media();
 await playing.play();await control.setVisible(false);
 assert.equal(playing.paused,true);assert.equal(idle.paused,true);
 await control.setVisible(true);assert.equal(playing.paused,false);assert.equal(idle.paused,true);
});
