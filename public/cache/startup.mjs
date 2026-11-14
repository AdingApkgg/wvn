// 启动集采用有界并发；大对象独占，失败或取消后停止派发并取消同批读取。
export async function prepareStartupResources(rows,read,{signal,concurrency=2,maxBytes=64*1024**2}={}){
 if(!Array.isArray(rows)||typeof read!=='function'||!Number.isInteger(concurrency)||concurrency<1||concurrency>4||!Number.isSafeInteger(maxBytes)||maxBytes<1||rows.some(row=>typeof row.sha256!=='string'||!Number.isSafeInteger(row.bytes)||row.bytes<0))throw Error('Invalid startup resource batch');
 const controller=new AbortController(),abort=()=>controller.abort(signal.reason),active=new Set();let at=0,bytes=0,failure;
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const check=()=>{controller.signal.throwIfAborted();if(failure)throw failure};
 try{
  while(at<rows.length||active.size){
   check();
   while(at<rows.length&&active.size<concurrency){
    const row=rows[at];if(active.size&&bytes+row.bytes>maxBytes)break;
    at++;bytes+=row.bytes;
    const task=Promise.resolve().then(()=>{check();return read(row.sha256,{signal:controller.signal})}).catch(error=>{failure??=error;controller.abort(error)}).finally(()=>{bytes-=row.bytes;active.delete(task)});active.add(task);
   }
   if(active.size)await Promise.race(active);
  }
  check();
 }finally{signal?.removeEventListener('abort',abort);await Promise.allSettled(active)}
}
