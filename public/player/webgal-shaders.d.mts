export function shaderSha256(source:string):string;
export function translateWebgalShader(source:string,type:number,id:string):string;
export function installWebgalShaderCompatibility(win:Window & typeof globalThis,entry:{id:string;engineFiles:Readonly<Record<string,string>>}):void;
