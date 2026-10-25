import {players}from'./registry.mjs';
export async function retireLegacyWorkers(serviceWorker,origin){
  if(!serviceWorker?.getRegistrations)return [];
  const paths=players.map(player=>'/'+player.directory.toLowerCase()+'/');const removed=[];
  for(const registration of await serviceWorker.getRegistrations()){
    const scope=new URL(registration.scope);if(scope.origin!==origin)continue;
    let path;try{path=decodeURIComponent(scope.pathname).toLowerCase()}catch{continue}
    if(paths.some(prefix=>path.startsWith(prefix))){if(!await registration.unregister())throw Error('旧版离线缓存尚未解除，请关闭旧版游戏页面后刷新重试');removed.push(scope.pathname)}
  }
  return removed;
}
let currentPreparation;
export function prepareCurrentContext(){
  if(!currentPreparation)currentPreparation=retireLegacyWorkers(navigator.serviceWorker,location.origin).catch(error=>{currentPreparation=undefined;throw error});
  return currentPreparation;
}
