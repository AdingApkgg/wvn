// 在远程 Chromium 验证已冻结 FX 的编译、链接和实际像素，不访问游戏存档。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {translateWebgalShader,shaderSha256} from '../public/player/webgal-shaders.mjs';
import {previewChromiumOptions} from './lib/preview-browser.mjs';
const fixtures=(process.env.WG_QA_SHADER_FIXTURES??process.env.WG_QA_SHADER_FIXTURE??'').split(','),out=process.env.WG_QA_RESULTS_ROOT,expected=Number(process.env.WG_QA_SHADER_COUNT??19);
assert(fixtures.every(f=>f.startsWith('/home/i/wvn-webgal-import-preview-20261029/reports/')));
assert(out?.startsWith('/home/i/wvn-webgal-import-preview-20261029/reports/'));
fs.mkdirSync(out,{recursive:true});
const sources=[...new Set(fixtures.flatMap(f=>JSON.parse(fs.readFileSync(f,'utf8')).map(x=>x.source)))];
assert.equal(sources.length,expected);
const programs=sources.map(source=>({hash:shaderSha256(source),vertex:translateWebgalShader(source,35633,'artemis-v37021-1'),fragment:translateWebgalShader(source,35632,'artemis-v37021-1')}));
assert(programs.every(p=>!p.fragment.includes('sampler_state')));
const options=previewChromiumOptions(process.env.WG_QA_TLS_CERT);options.args.push('--enable-unsafe-swiftshader');
const browser=await chromium.launch(options);
try{
 const page=await browser.newPage();
 const result=await page.evaluate(programs=>{
  const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false});if(!gl)throw Error('WebGL unavailable');
  const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)+'\n'+source);return shader;};
  const results=[];
  for(const item of programs){
   const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,item.vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,item.fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));results.push({hash:item.hash,compiled:true,linked:true});
   if(!/fore\.a\s*\*=\s*alpha;\s*result\s*=\s*fore;/.test(item.fragment))continue;
   gl.useProgram(program);
   const vertices=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
   const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
   for(const name of ['coord0','coord1']){const index=gl.getAttribLocation(program,name);if(index>=0){gl.disableVertexAttribArray(index);gl.vertexAttrib2f(index,.5,.5);}}
   const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([80,160,240,200]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.uniform1i(gl.getUniformLocation(program,'textureFore'),0);gl.uniform1f(gl.getUniformLocation(program,'alpha'),.5);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
   const pixels=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);results.at(-1).pixels=[...pixels];
  }
  return {version:gl.getParameter(gl.VERSION),programs:results,error:gl.getError()};
 },programs);
 assert.equal(result.error,0);assert.equal(result.programs.length,expected);
 const pixels=result.programs.filter(p=>p.pixels);assert(pixels.length);
 for(const row of pixels)assert(row.pixels.every((v,i)=>Math.abs(v-[80,160,240,100][i])<=1),JSON.stringify(row));
 fs.writeFileSync(out+'/result.json',JSON.stringify({status:'passed',...result},null,2));console.log(JSON.stringify({status:'passed',compiled:expected,linked:expected,pixelChecks:pixels.length}));
}finally{await browser.close();}
