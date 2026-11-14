import {test,expect} from '@playwright/test';

// 使用真实运行页和缩放函数，避免资源下载影响布局回归。
test('ONS canvas stays centered at its original aspect ratio after viewport changes',async({page})=>{
 await page.goto('/__ons/runtime/clannad');
 await page.waitForFunction(()=>typeof (window as any).scale_full==='function');
 for(const size of [{width:320,height:640},{width:375,height:667},{width:667,height:375},{width:1440,height:900}]){
  await page.setViewportSize(size);
  await page.evaluate(()=>(window as any).scale_full(document.getElementById('canvas'),4/3));
  const box=(await page.locator('#canvas').boundingBox())!;
  expect(Math.abs(box.x+box.width/2-size.width/2)).toBeLessThan(1);
  expect(Math.abs(box.y+box.height/2-size.height/2)).toBeLessThan(1);
  expect(Math.abs(box.width/box.height-4/3)).toBeLessThan(0.01);
 }
});
