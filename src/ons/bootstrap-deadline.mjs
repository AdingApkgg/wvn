// 只约束控制文档到首次可信启动回执，不限制原生引擎的下载、初始化或游玩时间。
export function watchBootstrap({timeoutMs=30000,onTimeout}){
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||typeof onTimeout!=='function')throw Error('Invalid bootstrap deadline');
 let pending=true;
 const timer=setTimeout(()=>{if(pending){pending=false;onTimeout()}},timeoutMs);
 const stop=()=>{if(!pending)return;pending=false;clearTimeout(timer)};
 return {acknowledge:stop,close:stop};
}
