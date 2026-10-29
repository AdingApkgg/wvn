import test from 'node:test';import assert from 'node:assert/strict';
import {compareNativeCaption} from '../scripts/lib/native-caption.mjs';
function image(seed,shift=0,background=[35,105,170]){
 const width=320,height=160,data=new Uint8Array(width*height*4);for(let i=0;i<data.length;i+=4)data.set([...background,255],i);
 const pixel=(x,y,color)=>data.set([...color,255],(y*width+x)*4);
 for(let row=0;row<8;row++)for(let col=0;col<30;col++){
  seed=(seed*1664525+1013904223)>>>0;if(seed<0x80000000)continue;
  const x=10+col*10+shift,y=35+row*10;
  for(let dy=-2;dy<7;dy++)for(let dx=-2;dx<7;dx++)pixel(x+dx,y+dy,[15,15,15]);
  for(let dy=0;dy<5;dy++)for(let dx=0;dx<5;dx++)pixel(x+dx,y+dy,[245,245,245]);
 }
 return {width,height,data};
}
const options={area:{x:0,y:0,width:1,height:1}};
test('the same outlined caption survives background animation and one pixel alignment',()=>{const result=compareNativeCaption(image(42),image(42,1,[80,130,40]),options);assert(result.referencePixels>100);assert(result.score>.95);});
test('a different caption cannot pass on a shared scene background',()=>assert(compareNativeCaption(image(42),image(1234),options).score<.85));
test('a blank scene cannot prove a restored checkpoint',()=>{const blank=image(42);blank.data.fill(0);assert.equal(compareNativeCaption(blank,blank,options).score,0);});
