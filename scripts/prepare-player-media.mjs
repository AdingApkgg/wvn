import fs from'node:fs';import path from'node:path';import{spawnSync}from'node:child_process';import{createHash}from'node:crypto';
const gameRoot='H:/wg',root='H:/wg-player-media-20261020',floor=66571993088;
const ffmpeg='C:/Program Files/ffmpeg/bin/ffmpeg.exe',ffprobe='C:/Program Files/ffmpeg/bin/ffprobe.exe';
const audit=JSON.parse(fs.readFileSync('reports/player-media/audit.json')),rows=[];
fs.mkdirSync(root,{recursive:true});
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const row of audit.filter(row=>row.needsFallback)){
 const disk=fs.statfsSync(root);if(disk.bavail*disk.bsize<floor+Math.max(row.bytes*4,256*1024*1024))throw Error('space_stop');
 const source=path.join(gameRoot,row.directory,row.file),sourceSHA256=hash(source),file=sourceSHA256+'.mp4',target=path.join(root,file),temporary=target+'.part.mp4';
 if(!fs.existsSync(target)){
  if(fs.existsSync(temporary))throw Error('Partial conversion exists; inspect before retry');
  const log=fs.openSync('reports/player-media/'+sourceSHA256+'.log','a');
  const result=spawnSync(ffmpeg,['-nostdin','-hide_banner','-v','error','-n','-i',source,'-map','0:v:0','-map','0:a:0?','-c:v','libx264','-threads','4','-pix_fmt','yuv420p','-fps_mode','passthrough','-bf','0','-preset','medium','-crf','19','-c:a','aac','-b:a','160k','-movflags','+faststart',temporary],{stdio:['ignore',log,log]});fs.closeSync(log);if(result.status!==0)throw Error('Conversion failed '+row.id+' '+row.file);
  const probe=spawnSync(ffprobe,['-v','error','-show_streams','-show_format','-of','json',temporary],{encoding:'utf8'});if(probe.status!==0)throw Error('Output probe failed');const doc=JSON.parse(probe.stdout),video=doc.streams.find(s=>s.codec_type==='video');
  if(video?.codec_name!=='h264'||video.pix_fmt!=='yuv420p'||video.width!==row.width||video.height!==row.height||Math.abs(Number(doc.format.duration)-row.duration)>.25)throw Error('Output differs in dimensions or duration '+row.file);
  if(row.audio&&!doc.streams.some(s=>s.codec_type==='audio'))throw Error('Audio missing');
  fs.renameSync(temporary,target);
 }
 rows.push({id:row.id,path:row.file,file,sourceSHA256,sourceBytes:row.bytes,sha256:hash(target),bytes:fs.statSync(target).size});
 fs.writeFileSync('reports/player-media/overrides.json',JSON.stringify({schema:1,entries:rows},null,2));
 console.log(JSON.stringify({id:row.id,path:row.file,converted:rows.length,total:audit.filter(r=>r.needsFallback).length,bytes:fs.statSync(target).size}));
}
console.log('MEDIA_PREPARED '+rows.length);
