import assert from 'node:assert/strict';
// 页面ReadableStream消费后CDP后取正文可能失效；这里只订阅同一真实请求的字节流，不拦截或重发。
export async function observeBrowserManifest({session,url,tasks,onManifest,limit=32*1024**2,timeout=60000}){
 const states=new Map();
 await session.send('Network.enable',{maxTotalBufferSize:64*1024**2,maxResourceBufferSize:limit});
 const matches=value=>{const actual=new URL(value),expected=new URL(url);return actual.origin===expected.origin&&actual.pathname===expected.pathname};
 function fail(state,error){if(state.settled)return;state.settled=true;clearTimeout(state.timer);state.parts=[];state.reject(error);}
 function add(state,data,first=false){if(state.settled||!data)return;const bytes=Buffer.from(data,'base64');state.size+=bytes.length;if(state.size>limit){fail(state,Error('Browser manifest body exceeds limit'));return;}if(first)state.parts.unshift(bytes);else state.parts.push(bytes);}
 session.on('Network.responseReceived',event=>{
  if(!matches(event.response.url))return;
  let resolve,reject;const task=new Promise((yes,no)=>{resolve=yes;reject=no});task.catch(()=>{});tasks.push(task);
  const state={resolve,reject,parts:[],size:0,settled:false,url:event.response.url};states.set(event.requestId,state);
  state.timer=setTimeout(()=>fail(state,Error('Browser manifest observation timed out')),timeout);state.timer.unref();
  state.start=(async()=>{
   assert.equal(event.response.status,200,'Browser manifest HTTP status');
   try{const result=await session.send('Network.streamResourceContent',{requestId:event.requestId});add(state,result.bufferedData,true)}
   catch(error){
    if(!/Request with the provided ID has already finished loading/.test(error.message))throw error;
    // 小清单可能先于订阅完成；读取同一请求的已缓冲正文，不重发请求。
    const result=await session.send('Network.getResponseBody',{requestId:event.requestId});
    state.parts=[];state.size=0;add(state,result.base64Encoded?result.body:Buffer.from(result.body).toString('base64'));
   }
  })();state.start.catch(error=>fail(state,error));
 });
 session.on('Network.dataReceived',event=>{const state=states.get(event.requestId);if(state)add(state,event.data)});
 session.on('Network.loadingFailed',event=>{const state=states.get(event.requestId);if(state){fail(state,Error('Browser manifest request failed: '+event.errorText));states.delete(event.requestId)}});
 session.on('Network.loadingFinished',async event=>{
  const state=states.get(event.requestId);if(!state)return;
  try{await state.start;if(state.settled)return;const body=Buffer.concat(state.parts);await onManifest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body)),{url:state.url,bytes:body.length});state.settled=true;clearTimeout(state.timer);state.parts=[];state.resolve();}catch(error){fail(state,error)}finally{states.delete(event.requestId)}
 });
 return {assertIdle(){assert.equal(states.size,0,'Browser manifest observation still pending')}};
}
