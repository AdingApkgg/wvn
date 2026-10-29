import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {players} from '../../public/player/registry.mjs';
import {webgalPlayers} from '../../public/player/webgal-registry.mjs';
const sha1=source=>createHash('sha1').update(source).digest('hex');
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
export function extendWebgalControl(document){
 const imported=new Set(webgalPlayers.map(p=>p.id)),allowed=new Set(players.map(p=>p.id));
 if(document?.schema!==1||!document.entries||Object.keys(document.entries).some(id=>!allowed.has(id)))throw Error('Unregistered control entry');
 for(const player of players){
  const row=document.entries[player.id];if(!row){if(imported.has(player.id))continue;throw Error('Missing original control entry');}
  if(typeof row.source!=='string'||Buffer.byteLength(row.source)!==row.bytes||sha1(row.source)!==row.sha1)throw Error('Control source checksum differs');
 }
 const entries={...document.entries};
 for(const player of webgalPlayers){
  // 只生成可信启动 DOM；上游统计、配置与预加载数据库代码不进入运行区。
  const source='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(player.title)+'</title><style>html,body{margin:0;background:#08090b;width:100%;height:100%;overflow:hidden}canvas{display:block;max-width:100%;max-height:100%;margin:auto;outline:none}</style></head><body><canvas id="canvas" tabindex="0" oncontextmenu="event.preventDefault()"></canvas><script>var Module={canvas:document.getElementById("canvas"),preRun:[],postRun:[],print:console.log,printErr:console.error};</script><script src="artemis.js"></script></body></html>';
  const row={source,bytes:Buffer.byteLength(source),sha1:sha1(source)},old=entries[player.id];
  if(old&&(old.source!==row.source||old.bytes!==row.bytes||old.sha1!==row.sha1))throw Error('Imported control identity differs');
  entries[player.id]=row;
 }
 return {schema:1,entries};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--input'||args[2]!=='--output')throw Error('Usage: webgal-control.mjs --input original-control.json --output new-control.json');
 const bytes=fs.readFileSync(args[1]);if(bytes.length>64*1024**2)throw Error('Control bundle exceeds limit');
 const result=extendWebgalControl(JSON.parse(bytes.toString('utf8'))),output=JSON.stringify(result);
 fs.writeFileSync(args[3],output,{flag:'wx',mode:0o600});console.log(JSON.stringify({status:'generated',entries:Object.keys(result.entries).length,sha256:createHash('sha256').update(output).digest('hex')}));
}
