import fs from 'node:fs';import path from 'node:path';import {spawnSync}from'node:child_process';
import {otherPlayers}from'../public/player/registry.mjs';
const root='H:/wg',report=[];
const ffprobe='C:/Program Files/ffmpeg/bin/ffprobe.exe';
for(const player of otherPlayers){
 const base=path.join(root,player.directory),files=new Set();
 const add=file=>{if(/\.(?:mp4|ogv|webm|m4v)$/i.test(file)&&fs.existsSync(path.join(base,file)))files.add(file.replaceAll('\\','/'))};
 const catalog=path.join(base,'pwa_catalog.json');
 if(fs.existsSync(catalog)){const doc=JSON.parse(fs.readFileSync(catalog,'utf8'));for(const file of doc.files??[])if(typeof file==='string')add(file)}
 function scan(dir,depth=0){if(depth>4)return;for(const item of fs.readdirSync(path.join(base,dir),{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())scan(file,depth+1);else if(item.isFile())add(file)}}
 for(const entry of fs.readdirSync(base,{withFileTypes:true}))if(entry.isDirectory()&&/^movie/i.test(entry.name))scan(entry.name);
 if(player.runtimeKind==='Tyrano'&&fs.existsSync(path.join(base,'data/video')))scan('data/video');
 if(player.runtimeKind==='RenPy')for(const dir of ['game/images/movie','game/movie','game/movies'])if(fs.existsSync(path.join(base,dir)))scan(dir);
 for(const file of files){const probe=spawnSync(ffprobe,['-v','error','-show_streams','-show_format','-of','json',path.join(base,file)],{encoding:'utf8',maxBuffer:2*1024*1024});if(probe.status!==0)throw Error(player.id+' '+file+' '+probe.stderr);const doc=JSON.parse(probe.stdout),video=doc.streams.find(s=>s.codec_type==='video'),audio=doc.streams.find(s=>s.codec_type==='audio');if(!video){report.push({id:player.id,directory:player.directory,file,noVideo:true,bytes:fs.statSync(path.join(base,file)).size});continue}report.push({id:player.id,directory:player.directory,file,codec:video.codec_name,pixFmt:video.pix_fmt,width:video.width,height:video.height,frames:video.nb_frames,audio:audio?.codec_name,bytes:fs.statSync(path.join(base,file)).size,duration:Number(doc.format.duration),needsFallback:['hevc','theora'].includes(video.codec_name)||(video.codec_name==='h264'&&video.pix_fmt!=='yuv420p')})}
 fs.mkdirSync('reports/player-media',{recursive:true});fs.writeFileSync('reports/player-media/audit.partial.json',JSON.stringify(report,null,2));
}
fs.mkdirSync('reports/player-media',{recursive:true});fs.writeFileSync('reports/player-media/audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({files:report.length,fallback:report.filter(r=>r.needsFallback).length,bytes:report.filter(r=>r.needsFallback).reduce((n,r)=>n+r.bytes,0),perEngine:report.filter(r=>r.needsFallback).reduce((a,r)=>(a[r.id]=(a[r.id]??0)+1,a),{})}));
