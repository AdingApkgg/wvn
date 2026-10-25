export type Pilot = Readonly<{id:string;workId:string;slot:number;versionId:string;title:string;directory:string;legacySave:string;route:string;engine:string}>;
export const pilots: readonly Pilot[];
export function findPilot(id:string): Pilot | undefined;
