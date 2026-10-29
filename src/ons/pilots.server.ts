import {configuredCloudRuntime,runtimeSession} from '../engines/cloud-runtime.ts';
import {configuredCandidate,candidateSession} from '../engines/candidate.ts';
import { pilots } from "../../public/ons/registry.mjs";
import {players} from "../../public/player/registry.mjs";
export { pilots, findPilot } from "../../public/ons/registry.mjs";
export const engineHash = "64ed1e7b9e92aa83b8106227d6095b3ab951e2bed75ac4bb8ed43f044737de04";
export function pilotForVersion(id: string, releaseId?:string) {
  const available=process.env.WG_ALL_ENGINES==='1'?players:process.env.WG_ONS_PILOT==='1'?pilots:[];
  const entry=available.find(p=>p.versionId===id);if(!entry)return;
  const scope=(player:typeof entry)=>'legacyDirectory' in player?player.legacyDirectory:undefined;
  const shared=available.filter(p=>p.legacySave===entry.legacySave&&scope(p)===scope(entry));
  const candidate=configuredCandidate(),engineCandidate=candidate?candidateSession(candidate,id):null;
  const runtime=configuredCloudRuntime(),option=runtime?runtimeSession(runtime,id):null;
  if(releaseId&&option?.engineReleaseId!==releaseId)throw new Response('引擎版本未登记',{status:404});
  return {...entry,...(process.env.WG_B2_CONTROL_FILE?{resourceDelivery:'cas' as const}:{}),...(option?{engineOption:option}:{}),...(releaseId&&option?{engineRuntime:option,engineReleaseId:option.engineReleaseId,saveCompatibilityId:option.saveCompatibilityId}:{}),...(engineCandidate?{engineCandidate}:{}),legacyHint:shared.length>1?'旧版有多个版本共用这份存档。请确认它属于当前版本；跨版本进度可能不兼容。':''};
}
// Exact trusted React routes only: never mount legacy HTML/JS on this listener.
export function trustedOnsPaths() {
  const bases = new Set((process.env.WG_ALL_ENGINES === "1" ? players : pilots).flatMap(p => [p.route.slice(0, -1), "/" + p.route.split("/")[1]]));
  return [...bases].flatMap(base => [base, base + "/", base + ".data", base + "/_.data"]);
}
