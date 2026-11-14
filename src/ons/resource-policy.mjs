// 仅存储/缓存桥接不可用可走已校验清单的原始地址；校验失败和主动取消仍失败。
export function canUseDirectResources(error,mode){
 if(mode==='complete'||!error||error.name==='AbortError'||/checksum|manifest|proof|identity|unregistered|differs/i.test(error.message??''))return false;
 if(error.name==='UnknownError'&&error.message==='The user denied permission to access the database.')return true;
 return ['SecurityError','QuotaExceededError','NotAllowedError','NotSupportedError','InvalidStateError'].includes(error.name)||['资源缓存连接超时','资源缓存线程失败','Public resource storage unavailable','No public chunk backend'].includes(error.message);
}
