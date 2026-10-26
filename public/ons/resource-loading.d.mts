export type ResourceProgress={active:number;failed?:boolean;loaded?:number;total?:number};
export function validateResourceProgress(value:unknown):ResourceProgress|null;
export function createResourceReporter(send:(value:unknown)=>void,options?:{now?:()=>number}):{activate():void;close():void;begin():{progress(loaded?:number,total?:number):void;end(failed?:boolean):void}};
export function observeResourceRequests(win:Window,startup:{phase(stage:string,kind:string):void;download?(kind:string,loaded?:number,total?:number):void},classify:(url:unknown)=>string|null,resources?:ReturnType<typeof createResourceReporter>):()=>void;
