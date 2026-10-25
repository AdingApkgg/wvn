export function retireLegacyWorkers(serviceWorker:Pick<ServiceWorkerContainer,'getRegistrations'>|undefined,origin:string):Promise<string[]>;
export function prepareCurrentContext():Promise<string[]>;
