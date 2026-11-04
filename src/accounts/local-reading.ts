import { useEffect, useState } from "react";

type Version = { id: string; url: string; number: number };
export type LocalReading = Version & { savedAt: string };

/** 仅读取当前投影提供的版本；不枚举其他作品或引擎的私人存档。 */
export function useLocalReading(versions: Version[]) {
  const key = JSON.stringify(versions.map(version=>[version.id,version.url,version.number]));
  const [snapshot,setSnapshot]=useState<{key:string;items:LocalReading[];unavailable:boolean}|null>(null);
  useEffect(()=>{
    let active=true;
    void(async()=>{
      const storagePath="/ons/storage.mjs",registryPath="/player/registry.mjs";
      const {openSaveStore}=await import(/* @vite-ignore */ storagePath) as typeof import("../../public/ons/storage.mjs");
      const {players}=await import(/* @vite-ignore */ registryPath) as typeof import("../../public/player/registry.mjs");
      const store=await openSaveStore();
      try{
        const items:LocalReading[]=[];
        for(const version of versions){
          const player=players.find(player=>player.versionId===version.id);if(!player)continue;
          const saved=await store.get(player.id);
          if(saved?.snapshot.files.some(file=>file.data.byteLength>0))items.push({...version,savedAt:saved.createdAt});
        }
        if(active)setSnapshot({key,items:items.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)),unavailable:false});
      }finally{store.close()}
    })().catch(()=>{if(active)setSnapshot({key,items:[],unavailable:true})});
    return()=>{active=false};
  },[key]);
  return snapshot?.key===key?snapshot:{key,items:[],unavailable:false};
}
