import type {Pilot} from '../ons/registry.mjs';
export type OtherPlayer = Pilot & {runtimeKind:'Artemis'|'RenPy'|'Tyrano';mount:string|null;legacyKeys:readonly string[];legacyDirectory?:string|null;extraMount?:string;engineFiles:Readonly<Record<string,string>>;packageFiles?:Readonly<Record<string,string>>};
export const otherPlayers:readonly OtherPlayer[];
export const players:readonly (Pilot|OtherPlayer)[];
export function findPlayer(id:string):Pilot|OtherPlayer|undefined;
