import { useEffect, useRef, useState } from 'react';
import { useAccount, AccountClientError, errorCopy } from '../accounts/client';
import type { SaveProfile, SaveRevision, SaveHistory } from '../accounts/saves.server';
import type { Snapshot } from '../../public/ons/protocol.mjs';
import type { CloudTarget, CloudDraft } from '../../public/ons/cloud.mjs';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { NativeSelect, NativeSelectOption } from '../components/ui/native-select';
const loadModule=async()=>{const path='/ons/cloud.mjs';return await import(/* @vite-ignore */ path) as typeof import('../../public/ons/cloud.mjs')};
type Props={pilot:CloudTarget;running:boolean;capture:()=>Promise<Snapshot>;restore:(snapshot:Snapshot,check:()=>void)=>Promise<void>;onBusy:(value:boolean)=>void;onStatus?:(value:string)=>void};
export function OnsCloud(props:Props){
  const account=useAccount();
  useEffect(()=>{props.onStatus?.(account.error?"云端账号暂时无法确认："+account.error:account.loading?"云端：正在确认账号":account.me?"云端：已登录，需手动上传":"云端：未登录，仅保留本机存档")},[account.loading,account.me?.binding,account.error,props.onStatus]);
  return <Card><CardHeader><CardTitle>账号云存档</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">本机保存与云端上传分别确认。保留本机和云端历史，不向游戏沙箱提供账号权限。本设备存档可匿名使用；上传前请核对目标账号。</p>
    {account.loading?<p>正在检查账号…</p>:account.me?<AuthenticatedCloud key={account.me.binding} {...props} account={account}/>:<div className="flex flex-wrap gap-3 items-center"><Button onClick={()=>{void account.passkey('login').catch(e=>account.setError(errorCopy(e instanceof AccountClientError?e.code:'NETWORK')))}}>使用通行密钥登录</Button><a className="underline text-sm" href="/account" target="_blank" rel="noreferrer">注册或管理账号</a><p className="text-sm">未登录时继续保留本机存档。</p></div>}
    {account.error&&<p role="alert">{account.error}</p>}
  </CardContent></Card>;
}
function AuthenticatedCloud({pilot,running,capture,restore,onBusy,onStatus,account}:Props&{account:ReturnType<typeof useAccount>}){
  const owner=account.me!.user.id, alive=useRef(true), locked=useRef(false), loadSequence=useRef(0);
  const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const [profile,setProfile]=useState<SaveProfile|null>(null),[history,setHistory]=useState<SaveRevision[]>([]),[next,setNext]=useState<string|null>(null),[selected,setSelected]=useState(''),[drafts,setDrafts]=useState<CloudDraft[]>([]);
  const [legacyProfile,setLegacyProfile]=useState<SaveProfile|null>(null),[legacyHistory,setLegacyHistory]=useState<SaveRevision[]>([]),[legacyNext,setLegacyNext]=useState<string|null>(null),[legacySelected,setLegacySelected]=useState('');
  function guard(){const accountCheck=account.guard();return()=>{accountCheck();if(!alive.current||!account.isOwner(owner))throw new AccountClientError('IDENTITY_CHANGED')}}
  const owned=<T,>(path:string,body?:unknown)=>account.request<T>(path,body,undefined,owner);
  async function load(check=guard()){
    const sequence=++loadSequence.current;
    const rows=await owned<SaveProfile[]>('/api/me/save-profiles?versionId='+encodeURIComponent(pilot.versionId)+(pilot.engineReleaseId?'&engineReleaseId='+encodeURIComponent(pilot.engineReleaseId):''));check();
    const p=rows[0]??null,page=p?await owned<SaveHistory>(`/api/me/save-profiles/${p.id}/revisions`):null;
    const pending=await(await loadModule()).cloudState.drafts(owner);check();if(sequence!==loadSequence.current)return;
    if(pilot.engineReleaseId){
      const old=(await owned<SaveProfile[]>('/api/me/save-profiles?versionId='+encodeURIComponent(pilot.versionId)))[0]??null;check();
      const oldPage=old?await owned<SaveHistory>(`/api/me/save-profiles/${old.id}/revisions`):null;check();
      setLegacyProfile(old);setLegacyHistory(oldPage?[...new Map([...(oldPage.current?[oldPage.current]:[]),...oldPage.items].map(r=>[r.id,r])).values()]:[]);setLegacyNext(oldPage?.next??null);
    }
    setProfile(p);setHistory(page?[...new Map([...(page.current?[page.current]:[]),...page.items].map(r=>[r.id,r])).values()]:[]);setNext(page?.next??null);setDrafts(pending.filter(d=>d.pilot===pilot.id&&d.version===pilot.versionId&&d.engineReleaseId===pilot.engineReleaseId));setLoaded(true);
  }
  useEffect(()=>{alive.current=true;void load().catch(e=>{if(alive.current){const text=e instanceof AccountClientError?errorCopy(e.code):'云端记录暂时无法读取，本机存档保留';setError(text);onStatus?.('云端读取失败：'+text)}});return()=>{alive.current=false;if(locked.current)onBusy(false)}},[owner,pilot.id,pilot.engineReleaseId]);
  async function action(fn:(check:()=>void)=>Promise<void>){
    if(locked.current)return;locked.current=true;setBusy(true);onBusy(true);setError('');
    const check=guard();
    try{await fn(check)}catch(e){if(alive.current){const text=e instanceof AccountClientError?errorCopy(e.code):e instanceof Error?e.message:'操作失败，原存档保留';setError(text);onStatus?.('云端操作未完成：'+text)}}
    finally{locked.current=false;if(alive.current){setBusy(false);onBusy(false)}}
  }
  async function upload(draft:CloudDraft,check:()=>void){
    check();if(draft.owner!==owner||draft.pilot!==pilot.id||draft.version!==pilot.versionId||draft.engineReleaseId!==pilot.engineReleaseId)throw new AccountClientError('IDENTITY_CHANGED');
    const mod=await loadModule();check();
    try{
      const u=await owned<{id:string;complete:boolean;files:{id:string;name:string}[]}>(`/api/me/save-profiles/${draft.profile}/uploads`,{captureId:draft.captureId,expectedHead:draft.expectedHead,generation:draft.generation,files:draft.files.map(({blob,...f})=>f)});check();
      if(!u.complete)for(const file of u.files){const local=draft.files.find(f=>f.name===file.name);if(!local)throw Error('上传清单与本机副本不一致');await account.upload(`/api/me/uploads/${u.id}/files/${file.id}`,local.blob,owner);check()}
      const result=await owned<{revision:SaveRevision;conflict:boolean}>(`/api/me/uploads/${u.id}/commit`,{});check();
      await mod.cloudState.acknowledge(draft,result.revision.id,result.conflict);check();setMessage('云端已保存新版本；原历史仍保留。');onStatus?.('云端：已保存新版本，后续进度需再次上传');
    }catch(e){
      check();
      if(e instanceof AccountClientError&&e.code==='CONTENT_CONFLICT'){
        const result=e.data as {revision?:SaveRevision};if(!result.revision?.id)throw e;
        await mod.cloudState.acknowledge(draft,result.revision.id,true);check();setMessage('云端已变化：本机副本已保留为云端冲突版本，当前云端进度未覆盖。请选择历史确认。');onStatus?.('云端：已保留冲突副本，请在存档管理中确认');
      }else{setMessage('上传未确认；副本仍在原账号的本机待上传队列，重新登录原账号后可重试。');throw e}
    }finally{if(alive.current&&account.isOwner(owner))await load(check)}
  }
  async function send(check:()=>void){
    if(!window.confirm(`将本设备的此游戏存档上传到账号「${account.me!.user.name}」？本机副本可能来自匿名游玩或其他账号；现有云端历史会保留。`))return;
    const snapshot=await capture();check();const mod=await loadModule(),packed=await mod.packSnapshot(snapshot,pilot);check();
    const p=profile??await owned<SaveProfile>('/api/me/save-profiles',{versionId:pilot.versionId,...(pilot.engineReleaseId?{engineReleaseId:pilot.engineReleaseId}:{})});check();
    const link=await mod.cloudState.link(owner,pilot.versionId,pilot.engineReleaseId);check();
    const draft:CloudDraft={...(pilot.engineReleaseId?{engineReleaseId:pilot.engineReleaseId}:{}),owner,pilot:pilot.id,version:pilot.versionId,profile:p.id,generation:p.generation,expectedHead:link?.profile===p.id&&link.generation===p.generation?link.head:null,captureId:crypto.randomUUID(),digest:packed.digest,files:packed.files};
    await mod.cloudState.enqueue(draft);check();setDrafts([draft]);setMessage('已保留待上传副本，正在同步云端…');await upload(draft,check);
  }
  async function apply(check:()=>void,legacyCopy=false){
    if(running)throw Error('请先结束阅读并保留存档，再恢复云端版本');
    const revision=(legacyCopy?legacyHistory:history).find(r=>r.id===(legacyCopy?legacySelected:selected)),p=legacyCopy?legacyProfile:profile;if(!revision||!p)throw Error('请选择云端历史版本');
    if(!window.confirm(legacyCopy?'将所选原引擎云档复制到新版独立工作区？原云档、本机原档与全部历史不变，复制后需手动上传新版云档。':'将这份云端备份用于下次启动？当前本机进度会留在历史中，旧存档库和云端当前版本均不改变。'))return;
    const mod=await loadModule(),files=[];
    if(revision.files.length<2||revision.files.length>3||revision.files.reduce((n,f)=>n+f.bytes,0)>64*1024**2)throw Error('此备份不是统一播放器格式，请在账号页下载原文件');
    for(const f of revision.files){
      const blob=await account.readFile(`/api/me/save-profiles/${p.id}/revisions/${revision.id}/files?name=${encodeURIComponent(f.name)}`,owner,f.bytes);check();
      if(await mod.sha256(await blob.arrayBuffer())!==f.sha256)throw Error('云端下载校验失败，本机存档未修改');files.push({name:f.name,blob});
    }
    const snapshot=await(legacyCopy?mod.copyLegacySnapshot(files,pilot):mod.unpackSnapshot(files,pilot));check();await restore(snapshot,check);check();
    if(!legacyCopy)await mod.cloudState.applied(owner,pilot.versionId,p,pilot.engineReleaseId);check();setMessage(legacyCopy?'原引擎云档已复制到新版工作区；原档案未改，新版云档需手动上传。':'云端备份已恢复到本机，下次启动使用；原本机进度保留在历史中。');
  }
  return <div className="space-y-4">
    <p className="text-sm">当前账号：<strong>{account.me!.user.name}</strong> <a className="underline ml-3" href="/account" target="_blank" rel="noreferrer">管理账号与全部备份</a></p>
    {pilot.engineReleaseId&&<div className="rounded border p-3 space-y-3"><p>新版引擎独立云档 · {pilot.engineReleaseId.slice(0,20)}</p><Label htmlFor="ons-legacy-cloud-history">原引擎云档（只读复制）</Label><NativeSelect id="ons-legacy-cloud-history" value={legacySelected} disabled={busy} onChange={e=>setLegacySelected(e.target.value)}><NativeSelectOption value="">选择原引擎云端历史…</NativeSelectOption>{legacyHistory.map(r=><NativeSelectOption key={r.id} value={r.id}>{new Date(r.createdAt).toLocaleString()} · {r.id===legacyProfile?.head?'原引擎当前版本':'原引擎历史版本'}</NativeSelectOption>)}</NativeSelect><Button variant="outline" disabled={busy||running||!legacySelected} onClick={()=>{void action(check=>apply(check,true))}}>复制原引擎云档到新版工作区</Button>{!legacyProfile&&<p>没有原引擎云档，可先切回原引擎手动上传。</p>}{legacyNext&&legacyProfile&&<Button disabled={busy} variant="ghost" onClick={()=>{void action(async check=>{const page=await owned<SaveHistory>(`/api/me/save-profiles/${legacyProfile.id}/revisions?cursor=${encodeURIComponent(legacyNext)}`);check();setLegacyHistory(h=>[...new Map([...h,...page.items].map(r=>[r.id,r])).values()]);setLegacyNext(page.next)})}}>加载更早的原引擎云档</Button>}</div>}
    {busy&&<Button variant="outline" onClick={()=>{void account.refresh(true)}}>暂停云端操作，保留本机副本</Button>}
    <div className="flex flex-wrap gap-3"><Button disabled={busy||!loaded||drafts.length>0} onClick={()=>{void action(send)}}>上传本机存档为新云端版本</Button><Button variant="outline" disabled={busy} onClick={()=>{void action(check=>load(check))}}>刷新云端历史</Button></div>
    {drafts.map(d=><div key={d.captureId} className="rounded border p-3 space-y-2"><p>此账号的待上传副本 · {d.files.reduce((n,f)=>n+f.bytes,0).toLocaleString()} 字节</p><Button disabled={busy} onClick={()=>{void action(check=>upload(d,check))}}>重试此账号的上传</Button><Button variant="ghost" disabled={busy} onClick={()=>{void action(async check=>{if(!window.confirm('移除此设备的待上传副本？请确认已有本机历史或导出备份。云端历史不变。'))return;await(await loadModule()).cloudState.discard(d.captureId);check();await load(check)})}}>移除此待上传副本</Button></div>)}
    <div className="flex flex-wrap items-center gap-3"><Label htmlFor="ons-cloud-history">云端历史版本</Label><NativeSelect id="ons-cloud-history" value={selected} disabled={busy} onChange={e=>setSelected(e.target.value)}><NativeSelectOption value="">选择一个云端版本…</NativeSelectOption>{history.map(r=><NativeSelectOption key={r.id} value={r.id}>{new Date(r.createdAt).toLocaleString()} · {r.conflict?'冲突副本':r.id===profile?.head?'当前云端版本':'历史版本'} · {r.files.length} 个备份文件</NativeSelectOption>)}</NativeSelect><Button variant="outline" disabled={busy||running||!selected} onClick={()=>{void action(apply)}}>保留本机历史，恢复所选云端版本</Button></div>
    {next&&profile&&<Button variant="ghost" disabled={busy} onClick={()=>{void action(async check=>{const page=await owned<SaveHistory>(`/api/me/save-profiles/${profile.id}/revisions?cursor=${encodeURIComponent(next)}`);check();setHistory(h=>[...new Map([...h,...page.items].map(r=>[r.id,r])).values()]);setNext(page.next)})}}>加载更早的云端版本</Button>}
    <p className="text-xs text-muted-foreground">恢复只对当前游戏版本生效。请先在游戏内保存；上传不会替你创建游戏内存档槽。首次连接已有云端记录时，先恢复可建立同步基线，否则上传会保留为冲突副本。</p>
    {message&&<p role="status" className="text-sm">{message}</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
