const cancellations=new Set(['AUTH_CANCELLED','REGISTRATION_CANCELLED','ERROR_CEREMONY_ABORTED','ERROR_PASSTHROUGH_SEE_CAUSE','ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY','NotAllowedError','AbortError']);
export function validNickname(value:string){const trimmed=value.normalize('NFKC').trim();return trimmed.length>0&&[...trimmed].length<=40&&!/[\p{Cc}\p{Cf}]/u.test(trimmed)}
export function passkeyFeedback(error:{code?:string;name?:string}){
 const code=error.code??error.name??'NETWORK';
 if(cancellations.has(code))return {kind:'notice' as const,message:'设备验证未完成，可能已取消或等待超时。准备好后可以重试。'};
 if(code==='ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'||code==='PREVIOUSLY_REGISTERED')return {kind:'error' as const,message:'这把通行密钥已经注册，请切换到登录。'};
 if(code==='PASSKEY_INVALID'||code==='AUTHENTICATION_FAILED')return {kind:'error' as const,message:'未能完成通行密钥验证，请重试或使用恢复码。'};
 return {kind:'error' as const,message:null};
}
