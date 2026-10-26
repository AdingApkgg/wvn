// 加载反馈独立于存档回执；只报告实际阶段与引擎/浏览器提供的数量。
const stages=['connecting','downloading','restoring','initializing','failed'];
const kinds=['engine','game'];
export function validateLoadingProgress(value){
 if(!value||value.type!=='loading-progress'||!stages.includes(value.stage))return null;
 if(value.kind!==undefined&&!kinds.includes(value.kind))return null;
 if(value.message!==undefined&&(typeof value.message!=='string'||value.message.length>300))return null;
 const result={stage:value.stage,...(value.kind?{kind:value.kind}:{}),...(value.stage==='failed'&&value.message?{message:value.message}:{})};
 if(value.loaded!==undefined||value.total!==undefined){
  if(!Number.isFinite(value.loaded)||!Number.isFinite(value.total)||value.loaded<0||value.total<=0||value.loaded>value.total)return null;
  result.loaded=value.loaded;result.total=value.total;
 }
 return result;
}
export function loadingPercent(value){return value?.stage==='downloading'&&Number.isFinite(value.loaded)&&Number.isFinite(value.total)&&value.total>0&&value.loaded>=0&&value.loaded<=value.total?Math.floor(value.loaded/value.total*100):null;}
export function createLoadingReporter(send,{now=()=>Date.now()}={}){
 let closed=false,failed=false,last=null,lastAt=-Infinity;
 function emit(value){
  if(closed||failed&&value.stage!=='failed')return;
  const event=validateLoadingProgress({type:'loading-progress',...value});if(!event)return;
  if(JSON.stringify(event)===JSON.stringify(last))return;
  const changed=event.stage!==last?.stage||event.kind!==last?.kind||Number.isFinite(event.total)!==Number.isFinite(last?.total);
  if(!changed&&loadingPercent(event)!==100&&now()-lastAt<200)return;
  last=event;lastAt=now();try{send({type:'loading-progress',...event})}catch{/* 关闭通道或界面反馈失败不能改变引擎行为。 */}
 }
 const reporter={
  phase(stage,kind){emit({stage,...(kind?{kind}:{})})},
  download(kind,loaded,total){emit({stage:'downloading',...(kind?{kind}:{}),...(Number.isFinite(loaded)&&Number.isFinite(total)&&total>0&&loaded>=0&&loaded<=total?{loaded,total}:{})})},
  engine(event){
   if(event?.type==='dependencies'){if(Number.isSafeInteger(event.remaining)&&event.remaining>=0)reporter.phase('initializing');return;}
   if(event?.type!=='status'||typeof event.text!=='string')return;
   if(/download|下载/i.test(event.text)&&!/complete|完成/i.test(event.text)){
    const n=/\(([\d.]+)\s*\/\s*([\d.]+)\)/.exec(event.text);reporter.download(undefined,n?Number(n[1]):undefined,n?Number(n[2]):undefined);
   }else if(/prepar|initializ|running|unpack|complete|准备|初始化|解压/i.test(event.text))reporter.phase('initializing');
  },
  fail(message){failed=true;emit({stage:'failed',message:String(message??'游戏加载失败，请取消后重试').slice(0,300)})},
  complete(){closed=true},
 };
 return reporter;
}
export {observeResourceRequests as observeStartupRequests} from './resource-loading.mjs';
