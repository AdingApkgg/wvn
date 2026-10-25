export function consumeStartupNotice(data:unknown,connection:{nonce:string;started:boolean},pilot:string):boolean{
 if(!data||typeof data!=='object'||connection.started)return false;
 const d=data as {type?:unknown;nonce?:unknown;pilot?:unknown};
 if(d.type!=='started'||d.nonce!==connection.nonce||d.pilot!==pilot)return false;
 connection.started=true;return true;
}
