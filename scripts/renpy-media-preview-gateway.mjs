import fs from 'node:fs';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream';
import {pathToFileURL} from 'node:url';

const archivePath='/__player/resource/renpy-v50789-1/game.zip';
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
// 独立预览入口：只替换已校验的游戏包副本，未登记的资源路径全部关闭。
export function createMediaPreviewGateway(receipt){
 if(receipt.schema!==1||receipt.player!=='renpy-v50789-1'||!receipt.originalArchiveUnchanged)throw Error('Invalid media receipt');
 for(const [path,sha,bytes] of [[receipt.sourceArchive,receipt.sourceArchiveSHA256,receipt.sourceArchiveBytes],[receipt.targetArchive,receipt.targetArchiveSHA256,receipt.targetArchiveBytes]]){
  if(!/^[a-f0-9]{64}$/.test(sha)||fs.statSync(path).size!==bytes||digest(path)!==sha)throw Error('Archive differs from verified receipt');
 }
 const etag='"'+receipt.targetArchiveSHA256+'"',size=receipt.targetArchiveBytes;
 return http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return}
  let url,decoded;try{url=new URL(req.url,'http://preview.invalid');decoded=decodeURIComponent(url.pathname)}catch{res.writeHead(400).end();return}
  if(!/^\/__(ons|player)\/(runtime|manifest|data|engine|resource)\//.test(url.pathname)||/[\\%\u0000-\u001f]/.test(decoded)||decoded.split('/').some(p=>p==='.'||p==='..'||p.startsWith('.')&&!/^\.[^.]+\.ogg$/i.test(p))){res.writeHead(404).end();return}
  if(url.pathname===archivePath){
   const headers={'content-type':'application/zip','accept-ranges':'bytes','cache-control':'no-store','etag':etag,'access-control-allow-origin':'*','cross-origin-resource-policy':'cross-origin','x-content-type-options':'nosniff'};
   if(req.headers['if-none-match']===etag){res.writeHead(304,headers).end();return}
   let start=0,end=size-1,status=200;
   if(req.headers.range&&(!req.headers['if-range']||req.headers['if-range']===etag)){
    const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!m||!m[1]&&!m[2]){res.writeHead(416,{...headers,'content-range':'bytes */'+size}).end();return}
    if(!m[1])start=Math.max(0,size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]))}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size){res.writeHead(416,{...headers,'content-range':'bytes */'+size}).end();return}
    status=206;headers['content-range']=`bytes ${start}-${end}/${size}`;
   }
   headers['content-length']=String(end-start+1);res.writeHead(status,headers);
   if(req.method==='HEAD')res.end();else pipeline(fs.createReadStream(receipt.targetArchive,{start,end}),res,()=>{});return;
  }
  res.writeHead(404).end();
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const receipt=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));createMediaPreviewGateway(receipt).listen(18575,'192.0.2.20',()=>console.log('Verified RenPy media preview: 18575'));
}
