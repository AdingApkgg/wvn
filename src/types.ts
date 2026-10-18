export interface WorkSeed {id:string;title:string;originalTitle:string;aliases:string[];evidence:string}
export interface VersionSeed {id:string;workId:string;number:number;title:string;legacyPath:string;engine:string}
export interface CatalogSeed {snapshotAt:string;works:WorkSeed[];versions:VersionSeed[]}
export interface Check {versionId:string;kind:'resources'|'http'|'startup';runId:string;startedAt:string;checkedAt:string;status:'passed'|'failed'|'incomplete';detail:string}
export interface Version extends VersionSeed {revision:number;status:'published'|'hidden'|'deleted';createdAt:string}
export interface PublicVersion {id:string;workId:string;number:number;title:string;engine:string;revision:number;url:string;launchPath:string;checks:Check[]}
export interface PublicWork extends WorkSeed {revision:number;defaultVersionId:string|null;url:string;versions:PublicVersion[]}
