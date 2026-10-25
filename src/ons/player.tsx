import { brand } from "../brand";
import { useEffect, useRef, useState } from "react";
import { Link, useBlocker } from "react-router";
import type { Snapshot } from "../../public/ons/protocol.mjs";
import type { SaveStore, SavedRevision } from "../../public/ons/storage.mjs";
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { nativeInputSpec, validatePlayerName } from "../../public/player/native-input.mjs";
import { NativeSelect, NativeSelectOption } from "../components/ui/native-select";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "../components/ui/alert-dialog";
import { OnsCloud } from './cloud';
import { ReadingSession } from '../accounts/reading-session';
import {consumeStartupNotice} from '../analytics/startup';
import {recordReading,trackPublicEvent} from '../analytics/client';
import {parseWorkSlug} from '../identity';

type Pilot = { id: string; title: string; versionId: string; engine: string; legacySave: string; runtimeKind?: string; legacyHint?: string; engineCandidate?: {releaseId:string;database:string;cloudEnabled:false;compatibility:"unknown";engineRelease?:{id:string;kind:string;files:{path:string;sha256:string}[]}} };
type History = Omit<SavedRevision, "snapshot" | "bytesHeld">;
type StorageModule = typeof import("../../public/ons/storage.mjs");
type ProtocolModule = typeof import("../../public/ons/protocol.mjs");
async function modules() {
  const storagePath = "/ons/storage.mjs", protocolPath = "/ons/protocol.mjs";
  return {
    storage: await import(/* @vite-ignore */ storagePath) as StorageModule,
    protocol: await import(/* @vite-ignore */ protocolPath) as ProtocolModule,
  };
}
export function OnsPlayer({ pilot, workUrl, cloud = false }: { pilot: Pilot; workUrl: string; cloud?: boolean }) {
  const [ready, setReady] = useState(false), [running, setRunning] = useState(false);
  const [gameStarted,setGameStarted]=useState(false);
  const [status, setStatus] = useState("正在读取本机存档…"), [error, setError] = useState("");
  const [localBusy, setBusy] = useState(false), [cloudBusy,setCloudBusy]=useState(false), [history, setHistory] = useState<History[]>([]), [selected, setSelected] = useState("");
  const busy=localBusy||cloudBusy;
  const [savePanel, setSavePanel] = useState(false), [cloudStatus, setCloudStatus] = useState(cloud ? "云端：正在确认账号" : "云端：未启用");
  const [head, setHead] = useState<SavedRevision | null>(null);
  const inputSpec=nativeInputSpec(pilot.id),[playerName,setPlayerName]=useState("");
  const store = useRef<SaveStore | null>(null), current = useRef<SavedRevision | null>(null);
  const frame = useRef<HTMLIFrameElement>(null), surface = useRef<HTMLDivElement>(null);
  const channel = useRef<{ port: MessagePort; nonce: string; seq: number; writing: boolean;started:boolean } | null>(null);
  const pending = useRef(new Map<string, { resolve: (value: { snapshot: Snapshot; saved: boolean }) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>());
  const active = useRef(true);
  const runningNow = useRef(false);
  function changeRunning(value: boolean) { runningNow.current = value; setRunning(value);setGameStarted(false); }
  const blocker = useBlocker(({ currentLocation, nextLocation }) => runningNow.current && currentLocation.pathname !== nextLocation.pathname);
  async function refresh() {
    const value = await store.current!.get(pilot.id);
    current.current = value; setHead(value); setHistory(await store.current!.history(pilot.id));
  }
  useEffect(() => {
    active.current = true;
    let instance: SaveStore | null = null;
    void (async () => {
      const { storage } = await modules(); instance = await storage.openSaveStore(pilot.engineCandidate?.database);
      if (!active.current) { instance.close(); return; }
      store.current = instance; await refresh();
      setReady(true); setStatus("本机存档已就绪");
    })().catch(e => { if (active.current) setError(e.message || "本机存档不可用"); });
    return () => {
      active.current = false; channel.current?.port.close(); channel.current = null;
      for (const request of pending.current.values()) { clearTimeout(request.timer); request.reject(Error("播放器已关闭")); }
      pending.current.clear(); instance?.close();
    };
  }, [pilot.id,pilot.engineCandidate?.releaseId]);
  useEffect(() => {
    if (!running) return;
    const before = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [running]);
  async function run(action: () => Promise<void>) {
    setError(""); setBusy(true);
    try { await action(); } catch (e) { if (active.current) setError(e instanceof Error ? e.message : "操作失败，原备份保留"); }
    finally { if (active.current) setBusy(false); }
  }
  async function connect() {
    if (!store.current || !frame.current?.contentWindow) return;
    channel.current?.port.close();
    const ports = new MessageChannel(), nonce = crypto.randomUUID();
    const connection = { port: ports.port1, nonce, seq: 0, writing: false,started:false }; channel.current = connection;
    const { protocol } = await modules();
    ports.port1.onmessage = async ({ data }) => {
      if (channel.current !== connection || !active.current || !data || data.nonce !== nonce || data.pilot !== pilot.id) return;
      if(consumeStartupNotice(data,connection,pilot.id)){
        setGameStarted(true);const id=parseWorkSlug(workUrl.split('/')[1]??'');if(id)void recordReading(id,pilot.versionId);trackPublicEvent('reading_start',undefined,window.location.pathname);return;
      }
      if (data.type === "status" && typeof data.message === "string" && data.message.length <= 500) { setStatus(data.message); return; }
      if (data.type !== "snapshot" || !Number.isSafeInteger(data.seq) || data.seq !== connection.seq + 1 || connection.writing) return;
      connection.seq = data.seq; connection.writing = true;
      let snapshot: Snapshot | undefined, saved = false;
      try {
        snapshot = protocol.validateSnapshot(data.snapshot, pilot.id);
        const value = await store.current!.commit(pilot.id, current.current?.revision ?? 0, snapshot, "engine");
        if (channel.current !== connection || !active.current) return;
        const changed = current.current?.revision !== value.revision;
        current.current = value; setHead(value); saved = true;
        if (changed) setHistory(await store.current!.history(pilot.id));
      } catch (e) { if (active.current) setError(e instanceof Error ? e.message : "本机保存失败，请导出当前存档"); }
      finally {
        connection.writing = false;
        if (channel.current === connection) ports.port1.postMessage({ type: "ack", nonce, pilot: pilot.id, seq: data.seq, ok: saved });
        const request = pending.current.get(data.requestId);
        if (request) {
          clearTimeout(request.timer); pending.current.delete(data.requestId);
          if (snapshot) request.resolve({ snapshot, saved }); else request.reject(Error("引擎返回的存档无效"));
        }
      }
    };
    // Opaque frames have no serializable target origin. Bind one dedicated port to
    // this exact frame; never broadcast credentials or expose a general fetch API.
    frame.current.contentWindow.postMessage({ type: "WG_ONS_INIT", pilot: pilot.id, nonce, ...(pilot.runtimeKind==='RenPy'&&pilot.engineCandidate?.engineRelease?{engineRelease:pilot.engineCandidate.engineRelease}:{}), ...(inputSpec?{nativeInput:{playerName:validatePlayerName(playerName)}}:{}), snapshot: current.current?.snapshot ?? { schema: 1, pilot: pilot.id, files: [] } }, "*", [ports.port2]);
  }
  function capture(): Promise<{ snapshot: Snapshot; saved: boolean }> {
    const connection = channel.current;
    if (!connection) return Promise.reject(Error("引擎尚未连接"));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.current.delete(requestId); reject(Error("存档读取超时，请保留页面后重试")); }, 30000);
      pending.current.set(requestId, { resolve, reject, timer });
      connection.port.postMessage({ type: "snapshot", pilot: pilot.id, nonce: connection.nonce, requestId });
    });
  }
  function download(text: string, suffix: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `wg-${pilot.id}-${suffix}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function adopt(snapshot: Snapshot, reason: "legacy-import" | "file-import" | "restore") {
    if (running) throw Error("请先结束阅读并保存，再恢复备份");
    if (current.current && !window.confirm("将以此备份作为下次启动的进度。当前进度会保留在历史备份中，是否继续？")) return;
    await store.current!.commit(pilot.id, current.current?.revision ?? 0, snapshot, reason);
    await refresh(); setStatus("备份已保留，下次启动将从此存档读取");
  }
  return (
    <main className="reader-shell">
      <header className="reader-heading">
        <Link to={workUrl} className="brand">← {pilot.title}</Link>
        <Link to="/" className="text-sm text-muted-foreground">发现更多故事</Link>
      </header>
      <div ref={surface} className="reader-surface" style={{ minHeight: running ? "min(72vh, 850px)" : "min(50vh, 520px)" }}>
        {running ? <iframe ref={frame} title={`${pilot.title} · ${pilot.runtimeKind ?? "ONS"} 沙箱`} src={`${pilot.runtimeKind ? "/__player/runtime/" : "/__ons/runtime/"}${pilot.id}`} sandbox="allow-scripts" allow="autoplay; fullscreen; gamepad" allowFullScreen onLoad={() => { void connect().catch(e => setError(e.message)); }} style={{ display: "block", border: 0, width: "100%", height: "72vh" }} /> : <p className="p-10 text-center text-muted-foreground">{head ? `已保留 ${head.snapshot.files.length} 个存档文件，开始阅读后恢复。` : `游戏自身保存后，${brand.shortName} 会保留本机副本。`}</p>}
      </div>
      {!running&&inputSpec&&<div className="my-4 max-w-sm space-y-2"><Label htmlFor="player-name">{inputSpec.label}</Label><Input id="player-name" value={playerName} maxLength={inputSpec.maxLength} autoComplete="off" placeholder="输入游戏中使用的名字" onChange={event=>setPlayerName(event.target.value)} /><p className="text-sm text-muted-foreground">开始新游戏时使用此名字；读取旧档后以存档内容为准。</p></div>}
      <div className="reader-toolbar" aria-label="阅读操作">
        <div className="reader-controls">
          {!running ? <Button disabled={!ready || busy} onClick={() => run(async () => { if(inputSpec)validatePlayerName(playerName); await refresh(); setStatus("正在连接沙箱…"); changeRunning(true); })}>{head?.snapshot.files.length ? "继续阅读" : "开始阅读"}</Button> : <>
            <Button variant="outline" disabled={busy} onClick={() => { const c = channel.current; if (c) c.port.postMessage({ type: "menu", pilot: pilot.id, nonce: c.nonce }); }}>游戏菜单</Button>
            <Button variant="outline" disabled={busy} onClick={() => run(async () => { const result = await capture(); if (!result.saved) throw Error("存档尚未保留，请先导出当前存档"); channel.current?.port.close(); channel.current = null; changeRunning(false); setStatus("阅读已结束，存档已保留"); })}>保存并退出</Button>
            <Button variant="ghost" onClick={() => run(async () => { await surface.current?.requestFullscreen(); })}>全屏</Button>
          </>}
        </div>
        <Button variant="ghost" aria-expanded={savePanel} aria-controls="reader-save-panel" onClick={() => setSavePanel(open => !open)}>存档管理</Button>
      </div>
      {pilot.engineCandidate&&<p role="note" className="muted">候选引擎 · 存档保留在独立工作区，云端同步关闭。导入旧档仅创建副本，兼容性尚未确认。</p>}
      <div className="reader-save-status" role="status" aria-live="polite"><span>本机：{status}</span><span>{cloudStatus}</span></div>
      {error && blocker.state !== "blocked" && <div role="alert" className="reader-error"><p>{error}</p><Button variant="outline" size="sm" onClick={() => setSavePanel(true)}>打开存档管理并导出</Button></div>}
      <p className="reader-tip">请先在游戏菜单内保存，再保存并退出。本机备份不会自动上传云端。</p>
      <ReadingSession running={running&&gameStarted} />
      <section id="reader-save-panel" className="reader-save-panel space-y-5" hidden={!savePanel} aria-label="存档管理面板">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2>存档管理</h2><Button variant="outline" disabled={!ready || busy} onClick={() => run(async () => { const { storage } = await modules(); const snapshot = running ? (await capture()).snapshot : current.current?.snapshot; if (!snapshot) throw Error("还没有可导出的存档"); download(await storage.exportBackup(snapshot,pilot.engineCandidate?.releaseId), "backup"); })}>导出当前存档</Button></div>
        {pilot.runtimeKind === "Tyrano" && <p className="text-sm text-muted-foreground">新存档使用文字缩略图；旧存档中的图片预览继续保留。</p>}
      {cloud&&ready&&<OnsCloud pilot={pilot} running={running} onStatus={setCloudStatus} onBusy={setCloudBusy} capture={async()=>{
        const result=runningNow.current?await capture():null;
        if(result&&!result.saved)throw Error('本机保存尚未成功，请先导出当前存档');
        const snapshot=result?.snapshot??current.current?.snapshot;
        if(!snapshot)throw Error('还没有可上传的本机存档');
        if(runningNow.current)await refresh();
        return snapshot;
      }} restore={async(snapshot,check)=>{
        check();if(runningNow.current)throw Error('请先结束阅读并保留存档');
        const base=current.current?.revision??0;
        await store.current!.commit(pilot.id,base,snapshot,'restore',check);
        check();await refresh();setStatus('云端备份已保留，下次启动将从此存档读取');
      }}/>}
      <Card><CardHeader><CardTitle>存档与旧档迁移</CardTitle></CardHeader><CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">只读提取本来源的旧游戏存档，原数据库保持不变。导入或恢复会新增历史副本；不会覆盖历史记录。运行期间请先结束阅读。</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" disabled={!ready || running || busy} onClick={() => run(async () => { const { storage } = await modules(); if(pilot.legacyHint&&!window.confirm(pilot.legacyHint+"\n仍要备份并导入当前版本吗？原存档不会修改。"))return; const snapshot = await storage.readLegacy(pilot.id); if (!snapshot || !snapshot.files.length) throw Error("当前网站来源没有这款游戏的旧存档；原有存档不会修改"); download(await storage.exportBackup(snapshot), "legacy-original"); await adopt(snapshot, "legacy-import"); })}>备份并读取本来源旧档</Button>
          <Label className="inline-flex cursor-pointer items-center rounded-md border px-4 py-2 text-sm" htmlFor="ons-backup-file">导入存档备份</Label>
          <input id="ons-backup-file" aria-label="导入存档备份" type="file" accept="application/json,.json" disabled={!ready || running || busy} className="max-w-full text-sm" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void run(async () => { if (file.size > 90 * 1024 * 1024) throw Error("备份文件过大"); const { storage } = await modules(); await adopt(await storage.importBackup(await file.text(), pilot.id,pilot.engineCandidate?{releaseId:pilot.engineCandidate.releaseId,allowLegacyCopy:true}:undefined), "file-import"); }); }} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor="ons-history">历史备份</Label>
          <NativeSelect id="ons-history" value={selected} onChange={event => setSelected(event.target.value)} disabled={!ready || busy}>
            <NativeSelectOption value="">选择一个保留的版本…</NativeSelectOption>
            {history.map(row => <NativeSelectOption key={row.id} value={row.id}>#{row.revision} · {new Date(row.createdAt).toLocaleString()} · {row.reason === "legacy-import" ? "旧档原始备份" : row.reason === "engine" ? "游戏存档" : "导入或恢复"}</NativeSelectOption>)}
          </NativeSelect>
          <Button variant="outline" disabled={!selected || running || busy} onClick={() => run(async () => { await adopt((await store.current!.getRevision(selected, pilot.id)).snapshot, "restore"); })}>下次启动使用此备份</Button>
          <Button variant="ghost" disabled={!selected || busy} onClick={() => run(async () => { const { storage } = await modules(); download(await storage.exportBackup((await store.current!.getRevision(selected, pilot.id)).snapshot,pilot.engineCandidate?.releaseId), "history"); })}>导出所选备份</Button>
        </div>
        <p className="text-xs text-muted-foreground">共享引擎 <code>{pilot.engine.slice(0, 12)}</code> · 每个游戏版本使用独立存档空间。旧存档不会被清理。</p>
        <a href="https://github.com/YuriSizuku/OnscripterYuri" target="_blank" rel="noreferrer" className="text-xs underline">ONScripterYuri 源码与 GPL-2.0 许可</a>
      </CardContent></Card>
      </section>
      <AlertDialog open={blocker.state === "blocked"} onOpenChange={open => { if (!open && blocker.state === "blocked" && !busy) blocker.reset(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>保存后离开故事？</AlertDialogTitle>
            <AlertDialogDescription>请先在游戏中保存进度。离开前，{brand.shortName} 会等待本机备份写入成功；保存失败时会保留此页。</AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p role="alert" className="text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>继续阅读</AlertDialogCancel>
            <Button variant="outline" disabled={busy} onClick={() => run(async () => { const { storage } = await modules(); download(await storage.exportBackup((await capture()).snapshot,pilot.engineCandidate?.releaseId), "before-leaving"); })}>导出当前存档</Button>
            <Button disabled={busy} onClick={() => run(async () => {
              if (blocker.state !== "blocked") return;
              const proceed = blocker.proceed;
              if (!(await capture()).saved) throw Error("本机备份尚未成功，请先导出当前存档");
              channel.current?.port.close(); channel.current = null; changeRunning(false); proceed();
            })}>保存并离开</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
