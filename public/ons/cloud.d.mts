import type { Snapshot } from './protocol.mjs';
export type CloudTarget={id:string;versionId:string;engine:string};
export type CloudFile={name:string;bytes:number;sha256:string;blob:Blob};
export type CloudDraft={owner:string;pilot:string;version:string;profile:string;generation:number;expectedHead:string|null;captureId:string;digest:string;files:CloudFile[]};
export type CloudLink={profile:string;generation:number;head:string|null};
export function sha256(bytes:ArrayBuffer|Uint8Array):Promise<string>;
export function packSnapshot(input:Snapshot,target:CloudTarget):Promise<{digest:string;files:CloudFile[]}>;
export function unpackSnapshot(files:{name:string;blob:Blob}[],target:CloudTarget):Promise<Snapshot>;
export const cloudState:{link(owner:string,version:string):Promise<CloudLink|null>;drafts(owner:string):Promise<CloudDraft[]>;enqueue(draft:CloudDraft):Promise<void>;discard(id:string):Promise<void>;acknowledge(draft:CloudDraft,head:string,conflict:boolean):Promise<void>;applied(owner:string,version:string,profile:{id:string;generation:number;head:string|null}):Promise<void>};
