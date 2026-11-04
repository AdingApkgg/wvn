export function ownOpeningTask<T>(reference:{current:Promise<T>|null},operation:()=>Promise<T>):Promise<T>;
export function runCurrentStep<T>(isCurrent:()=>boolean,operation:()=>Promise<T>):Promise<T>;
export function commitCurrentStep(isCurrent:()=>boolean,operation:()=>void):boolean;
