// 异步完成只可提交给仍然属于自己的准备或启动尝试。
const cancelled=()=>new DOMException('Obsolete player operation','AbortError');
export function ownOpeningTask(reference,operation){const task=Promise.resolve().then(operation).finally(()=>{if(reference.current===task)reference.current=null});reference.current=task;return task}
export async function runCurrentStep(isCurrent,operation){
 if(!isCurrent())throw cancelled();
 try{const value=await operation();if(!isCurrent())throw cancelled();return value}catch(error){if(!isCurrent())throw cancelled();throw error}
}
export function commitCurrentStep(isCurrent,operation){if(!isCurrent())return false;operation();return true}
