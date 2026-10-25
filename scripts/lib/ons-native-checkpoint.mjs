import { createHash } from "node:crypto";
// Test evidence only. ONScripter_file2.cpp writes script line and colon as the
// last two LE ints; ONScripter_file.cpp optionally appends a quoted title + '*'.
// This never creates or edits a native slot and accepts only pinned 2.8 output.
export function nativeCheckpoint(input){
 const b=Buffer.from(input);
 if(b.length<13||b.subarray(0,3).toString()!=='ONS'||b[3]!==2||b[4]!==8)throw Error('Unrecognized native save format');
 let end=b.length;
 if(b[end-1]===42&&b[end-2]===34){const quote=b.lastIndexOf(34,end-3);if(quote<13)throw Error('Malformed native save description');end=quote}
 if(end<13)throw Error('Truncated native checkpoint');
 const line=b.readInt32LE(end-8),colon=b.readInt32LE(end-4);
 if(line<0||line>10000000||colon<0||colon>10000)throw Error('Invalid native checkpoint');
 return{version:208,line,colon};
}

// Saved text pages precede the last checkpoint. Their count occurs twice;
// validate the preceding 2.8 geometry fields rather than guessing from bytes.
export function nativeTextCheckpoint(input) {
 const point=nativeCheckpoint(input),b=Buffer.from(input);
 let end=b.length;if(b[end-1]===42&&b[end-2]===34)end=b.lastIndexOf(34,end-3);
 const payloadEnd=end-8;
 function previousString(at){if(at<1||b[at-1]!==0)return -1;return b.lastIndexOf(0,at-2)+1}
 let tags=payloadEnd;
 for(let count=0;count<=4096&&tags>=9;count++){
  const countAt=tags-4;
  if(b.readInt32LE(countAt)===count){
   let pages=countAt;for(let i=0;i<count&&pages>=0;i++)pages=previousString(pages);
   if(pages>=29&&b.readInt32LE(pages-4)===count){
    const geometry=pages-24,zero=b.readInt32LE(geometry),quarter=b.readInt32LE(geometry+4),half=b.readInt32LE(geometry+8),three=b.readInt32LE(geometry+12),underline=b.readInt32LE(geometry+16);
    if(zero===0&&quarter>=80&&quarter<=4096&&half===quarter*2&&three===quarter*3&&underline>=100&&underline<=16384)
     return {...point,pageCount:count,pages:createHash('sha256').update(b.subarray(pages,payloadEnd)).digest('hex')};
   }
  }
  tags=previousString(tags);if(tags<0)break;
 }
 throw Error('Native 2.8 text history layout not recognized');
}

// A loadgosub may temporarily change the saved script address. Only a
// documented hook address plus unchanged nonempty text history can match A.
export function sameNativeStory(saved, loaded, loadHookLine) {
 if(saved.version!==loaded.version||saved.colon!==loaded.colon)return false;
 if(saved.pageCount!==loaded.pageCount||saved.pages!==loaded.pages)return false;
 if(saved.line===loaded.line)return true;
 return Number.isSafeInteger(loadHookLine)&&loaded.line===loadHookLine&&saved.pageCount>0&&/^[a-f0-9]{64}$/.test(saved.pages??'');
}
