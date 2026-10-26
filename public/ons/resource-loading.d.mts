export type TransferMetrics={bytesLoaded?:number;bytesTotal?:number;bytesPerSecond?:number};
export type ResourceProgress=TransferMetrics&{active:number;failed?:boolean;loaded?:number;total?:number};
export function validateResourceProgress(value:unknown):ResourceProgress|null;
export function createResourceReporter(send:(value:unknown)=>void,options?:{now?:()=>number}):{activate():void;close():void;begin():{progress(loaded?:number,total?:number):void;end(failed?:boolean):void}};
export function observeResourceRequests(win:Window,startup:{phase(stage:string,kind:string):void;download?(kind:string,loaded?:number,total?:number,metrics?:TransferMetrics):void},classify:(url:unknown)=>string|null,resources?:ReturnType<typeof createResourceReporter>):()=>void;
export function validateTransferMetrics(value:unknown):TransferMetrics|null;
export function createTransferMeter(options?:{now?:()=>number}):{sample(loaded?:number,total?:number):TransferMetrics};
export function formatTransferBytes(value?:number):string|null;
export function readResourceBytes(response:Response):Promise<Uint8Array>;
