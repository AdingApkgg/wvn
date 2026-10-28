// 一次性准备公开控制清单；运行服务不向 B2 取正文，也不代理资源。
import {players} from '../../public/player/registry.mjs';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve,dirname} from 'node:path';import {createHash} from 'node:crypto';
const proxy=process.env.HTTPS_PROXY??process.env.https_proxy;if(!proxy)throw Error('Existing proxy is required');
const output=resolve(process.argv[2]??'state/compose/b2-direct-control.json'),temporary=await mkdtemp(join(tmpdir(),'wvn-b2-controls-')),entries={},run=promisify(execFile);let cursor=0;
try{
 await Promise.all(Array.from({length:8},async()=>{for(;;){const i=cursor++;if(i>=players.length)return;const p=players[i],key='games/'+p.directory+'/'+(p.runtimeKind?'index.html':'onsyuri_index.json'),url='https://wg-b2.saop.cc/releases/20261027-01/'+key.split('/').map(encodeURIComponent).join('/'),headers=join(temporary,i+'.headers'),body=join(temporary,i+'.body');
  await run('curl',['--proxy',proxy,'--noproxy','','--http2','--silent','--show-error','--fail','--retry','2','--retry-all-errors','--max-time','60','--max-filesize',String(8*1024**2),'--dump-header',headers,'--output',body,'--url',url],{maxBuffer:4096});
  const data=await readFile(body),h=await readFile(headers,'utf8'),sha1=[...h.matchAll(/^x-bz-content-sha1:\s*([a-f0-9]{40})\s*$/gim)].at(-1)?.[1];
  if(!sha1||createHash('sha1').update(data).digest('hex')!==sha1)throw Error('Control source checksum differs: '+p.id);
  entries[p.id]={source:data.toString('utf8'),sha1,bytes:data.length};console.log(JSON.stringify({id:p.id,controlBytes:data.length,sha1Matched:true}));
 }}));
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify({schema:1,entries},null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify({status:'prepared',entries:Object.keys(entries).length,output,resourceBodyProxy:false}));
}finally{await rm(temporary,{recursive:true,force:true});}
