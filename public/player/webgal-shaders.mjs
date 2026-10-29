// 仅对五个已冻结转换包中核对过的 Direct3D FX 程序作浏览器内转换。
// B2 正文、WASM 和存档身份不变；未知程序和其他版本保持原样。
const games=new Set(['artemis-v37021-1','artemis-v39197-1','artemis-v562-3','artemis-v1115-2','artemis-v20431-2']);
const hashes=new Set([
 "0bfbaf6dfe46151fbad0687e6eae2810cc2755cd2ebced890aabb0bb13e8a006",
 "110ec434d003b0848f28465834df5334da5f2f5b38f17f4850a4cacbfacfb09d",
 "2ce3993e50b93a16b86e7eb92bba8a2d3d1cf8d951d3ff52d4da6d1138fe89e1",
 "3350d77079ca7bcdc33ba515608596b8f764194adb4c9dc9a187bd4881c30d00",
 "40477ceca5377c3500cc8d60a266b3ef073264beba34a1068edaa1c22fec5652",
 "4a067677907809412402d7661a30c2a728e19a430a7148735b7c2c809e52acf6",
 "4be7491284ab43d707b2ec7490c37c911d8daccbefde866f6b87e2a11ad0e4ec",
 "57c2ba521bc70163744ae7acdea4a214f0902ac3bd2f440ebbaffcdd8b46f6e2",
 "5aa78114d99d722e8048b89dcc581d1c646e231145c020ebd621829438dd7635",
 "5f6084b0a9000b2aefc7502e9bb160fc7d6b32b01a3e0c3ac2d0098d48ecb3dc",
 "6fa56eb0e99084cb7d2298337b4ca484569888656cf2504076bc51ce15894538",
 "7a4633df3e7c4fe093a88e14887c87637a6215e5c8fa4754293479489bea4402",
 "7a86797f8d904ab8a27b8e23d17d8ccd3efaeb9f0945e01d1026911ebea0560b",
 "7aadfdc23412d643f8424ff244975b612b7866e28fe9597f5ec73df6eaf383af",
 "936eba1ad70d559907b7b216ad0d1b27f94a9aacdbe7d1987d2f765b53c5a91a",
 "96cef0772c9601da92bb5eefe90eea1672bec5f88f05aea2d5ecafccf761a86f",
 "99b4bf0e84befbf03716c7577151c87c345ece7396df3752e9b2cd0969577542",
 "9acfe7e331c07f98dc475940c36abffd5fefdef03b83cd56358db348f69b7d38",
 "b337812747a88d14ce9b45c44d552a2be54e0499040065680ef82f8ca9075548",
 "cb36934381daaeff49c12d6838cd0ba1341822ba6b0c52055fd58f02cb2dfce2",
 "cb8763223cf6f34de194c477130c44c88608837a6c91ed2d977186afcde45d34",
 "cbdcebaa2a495912bc388e0c2b317230c94c2fc87a6eeb3d7ff976935b090cd2",
 "cc2a75d320e5178954665cfac77871ca6aed129a091e509e463aee2decc4cf2a",
 "d639391051bcc7afd7d00dafd06c9e93ee1f5724f91052fa27f3097d034b76f3",
 "d6763064e8699beefeb73123300096d505023f9aeb1ef9d517a4f3be92809969",
 "ddc4d6db441448f93a91f62ff1d73bc6e2e75731409a707e5dd98b0dbc9affe9",
 "f658f114a137169216ed35860fc2d77f022a094f2ce533ccca6724bb856391be",
 "ff8275a597e2b0770b17799497a6d5a0b1712a5ad144a52c9ffebd4cc786c0d0"
]);
const K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const rotate=(v,n)=>(v>>>n)|(v<<(32-n));
// shaderSource 是同步 WebGL 接口；在提交前同步核对完整 UTF-8 文本摘要。
export function shaderSha256(source){
 const input=new TextEncoder().encode(source),bytes=new Uint8Array(Math.ceil((input.length+9)/64)*64);bytes.set(input);bytes[input.length]=128;
 const view=new DataView(bytes.buffer);view.setUint32(bytes.length-8,Math.floor(input.length/0x20000000));view.setUint32(bytes.length-4,input.length*8);
 const state=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),w=new Uint32Array(64);
 for(let offset=0;offset<bytes.length;offset+=64){
  for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4);
  for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(w[i-16]+(rotate(a,7)^rotate(a,18)^(a>>>3))+w[i-7]+(rotate(b,17)^rotate(b,19)^(b>>>10)))>>>0;}
  let[a,b,c,d,e,f,g,h]=state;
  for(let i=0;i<64;i++){const first=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0,second=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+first)>>>0;d=c;c=b;b=a;a=(first+second)>>>0;}
  for(const [i,value]of[a,b,c,d,e,f,g,h].entries())state[i]=(state[i]+value)>>>0;
 }
 return [...state].map(v=>v.toString(16).padStart(8,'0')).join('');
}
const vertex='attribute vec4 position; attribute vec2 coord0; attribute vec2 coord1; varying vec2 resultCoord0; varying vec2 resultCoord1; void main(){gl_Position=position;resultCoord0=coord0;resultCoord1=coord1;}';
export function translateWebgalShader(source,type,id){
 if(!games.has(id)||typeof source!=='string'||source.length>16384||!hashes.has(shaderSha256(source)))return source;
 const text=source.replace(/\r\n?/g,'\n').replace(/\/\/[^\n]*/g,''),vs=text.indexOf('void vs('),ps=text.indexOf('void ps('),end=text.indexOf('technique');
 if(vs<0||ps<=vs||end<=ps)throw Error('Registered FX structure differs');
 const vertexBody=/\{([^}]*)\}\s*$/.exec(text.slice(vs,ps))?.[1].replace(/\s/g,'');
 if(vertexBody!=='resultPosition=position;resultTexCoord0=texCoord0;resultTexCoord1=texCoord1;')throw Error('Registered FX vertex differs');
 if(type===35633)return vertex;if(type!==35632)return source;
 const pixel=/^void ps\([^)]*\)\s*\{([\s\S]*)\}\s*$/.exec(text.slice(ps,end));if(!pixel)throw Error('Registered FX pixel differs');
 const samplers=new Map();let prefix=text.slice(0,vs).replace(/sampler\s+(\w+)\s*=\s*sampler_state\s*\{\s*texture\s*=\s*<(\w+)>;[\s\S]*?\};/g,(_,sampler,texture)=>{samplers.set(sampler,texture);return '';});
 prefix=prefix.replace(/\btexture\s+(\w+)\s*;/g,'uniform sampler2D $1;').replace(/^(\s*)(float[234]?)\s+(\w+\s*(?:\[\d+\])?)\s*;/gm,'$1uniform $2 $3;');
 let result=prefix+'\nvoid main(){vec2 texCoord0=resultCoord0;vec2 texCoord1=resultCoord1;vec4 result;'+pixel[1]+'\ngl_FragColor=result;}';
 result=result.replace(/\bfloat([234])\b/g,'vec$1').replace(/\btex2D\b/g,'texture2D').replace(/\bfrac\b/g,'fract');
 // 这四个 FX 的整数常量在原语言中隐式提升；GLSL ES 1.0 要求显式浮点除数。
 result=result.replace(/\(1\.0 - steps\) \/ 2;/g,'(1.0 - steps) / 2.0;');
 for(const [sampler,texture]of samplers)result=result.replace(new RegExp('\\b'+sampler+'\\b','g'),texture);
 if(/\bsampler_state\b|\btechnique\b|\btex2D\b/.test(result))throw Error('Unconverted registered FX');
 return 'precision highp float;\nvarying vec2 resultCoord0;varying vec2 resultCoord1;\n'+result;
}
export function installWebgalShaderCompatibility(win,entry){
 if(!games.has(entry.id))return;
 if(entry.engineFiles?.['artemis.wasm']!=='164b2e5191e40562695d001a93dc6fe68d5cfa860430275629f45a9eac36614c')throw Error('Shader compatibility engine differs');
 const stats={translated:0,programs:[]},cache=new Map();win.__wvnShaderCompatibility=stats;
 const proto=win.WebGLRenderingContext.prototype,original=proto.shaderSource;
 proto.shaderSource=function(shader,source){
  const type=this.getShaderParameter(shader,this.SHADER_TYPE),key=type+'\0'+source;let converted=cache.get(key);
  if(converted===undefined){converted=translateWebgalShader(source,type,entry.id);cache.set(key,converted);}
  if(converted!==source){stats.translated++;const hash=shaderSha256(source);if(!stats.programs.includes(hash))stats.programs.push(hash);}
  return original.call(this,shader,converted);
 };
}
