export type LoadingProgress={stage:'connecting'|'downloading'|'restoring'|'initializing'|'failed';kind?:'engine'|'game';loaded?:number;total?:number;message?:string};
export function validateLoadingProgress(value:unknown):LoadingProgress|null;
export function loadingPercent(value:LoadingProgress|null):number|null;
export function createLoadingReporter(send:(value:unknown)=>void,options?:{now?:()=>number}):{phase(stage:LoadingProgress['stage'],kind?:LoadingProgress['kind']):void;download(kind?:LoadingProgress['kind'],loaded?:number,total?:number):void;engine(event:unknown):void;fail(message:unknown):void;complete():void};
export function observeStartupRequests(win:Window,reporter:ReturnType<typeof createLoadingReporter>,classify:(url:unknown)=>LoadingProgress['kind']|null):()=>void;
