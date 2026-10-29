// 比较带深色描边的白色剧情文字；人物与背景动画不参与判断。
export function compareNativeCaption(reference,current,{rect={x:0,y:0,width:current.width,height:current.height},area={x:.15,y:.74,width:.6,height:.1}}={}){
 const width=reference.width,height=reference.height;
 function foreground(image,box){
  const pixels=new Set(),sample=(x,y)=>{x=Math.round(box.x+x*box.width/width);y=Math.round(box.y+y*box.height/height);if(x<0||y<0||x>=image.width||y>=image.height)return null;const i=(y*image.width+x)*4;return image.data.subarray(i,i+3);};
  for(let y=Math.floor(area.y*height);y<(area.y+area.height)*height;y++)for(let x=Math.floor(area.x*width);x<(area.x+area.width)*width;x++){
   const value=sample(x,y);if(!value||Math.min(...value)<205||Math.max(...value)-Math.min(...value)>35)continue;
   const dark=[[3,0],[-3,0],[0,3],[0,-3],[2,2],[-2,-2]].some(([dx,dy])=>{const neighbor=sample(x+dx,y+dy);return neighbor&&Math.max(...neighbor)<85;});if(dark)pixels.add(y*width+x);
  }
  return pixels;
 }
 const a=foreground(reference,{x:0,y:0,width,height}),b=foreground(current,rect);
 function matched(from,to){let n=0;for(const p of from){let found=false;for(let dy=-2;dy<=2&&!found;dy++)for(let dx=-2;dx<=2;dx++)if(to.has(p+dy*width+dx)){found=true;break}if(found)n++;}return n;}
 const score=a.size<100||b.size<100?0:Math.min(matched(a,b)/a.size,matched(b,a)/b.size);
 return {score,referencePixels:a.size,currentPixels:b.size};
}
