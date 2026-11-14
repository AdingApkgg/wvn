import { Link, useNavigate, useBlocker } from "react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useContentAccess } from "../content/client";
import { CloudBackups } from "./cloud";
import { AccountClientError, errorCopy, type useAccount } from "./client";
import type { CatalogItem, LibraryEntry } from "./library.server";
import { shelfWorkIds } from "../lib/reader-experience";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "../components/ui/native-select";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "../components/ui/alert-dialog";

const statuses = { wanted: "想读", playing: "在读", completed: "已读", paused: "搁置", dropped: "放弃" };
type Account = ReturnType<typeof useAccount>;
type BookDraft = { editing: boolean; status: string; note: string; revision: number; base: {status: string; note: string}; version: string };

export function Library({ account, run, view = "library" }: { account: Account; view?: string; run: (fn: () => Promise<void>) => Promise<void> }) {
  const [storedCatalog, setCatalog] = useState<CatalogItem[]>([]), [storedEntries, setEntries] = useState<LibraryEntry[]>([]), [storedFavorites, setFavorites] = useState<string[]>([]);
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("all"), [addQuery, setAddQuery] = useState(""), [selected, setSelected] = useState("");
  const navigate = useNavigate(), { api } = account, content = useContentAccess();
  const scope = content.enabled ? content.access : null, scopeReady = !content.enabled || (!content.loading && !content.pendingPublic), binding = account.me?.binding ?? "";
  const latest = useRef({ scope, binding, ready: scopeReady }); latest.current = { scope, binding, ready: scopeReady };
  const [loaded, setLoaded] = useState<{ scope: typeof scope; binding: string } | null>(null), [loadError, setLoadError] = useState("");
  const visible = !!loaded && scopeReady && loaded.scope === scope && loaded.binding === binding;
  const catalog = visible ? storedCatalog : [], entries = visible ? storedEntries : [], favorites = visible ? storedFavorites : [];
  const notesReadOnly = content.enabled && !content.access.canViewRestricted;
  const dirtyWorks = useRef(new Set<string>()), [dirty, setDirty] = useState(false);
  const drafts=useRef(new Map<string,BookDraft>());
  const [pendingReading,setPendingReading]=useState<{versionId:string;url:string}|null>(null);
  const [draftGeneration,setDraftGeneration]=useState(0);
  const blocker = useBlocker(dirty && view === "library");
  function markDirty(id: string, value: boolean) { value ? dirtyWorks.current.add(id) : dirtyWorks.current.delete(id); setDirty(dirtyWorks.current.size > 0); }
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  useEffect(() => {
    if (!scopeReady) return;
    let live = true; setSelected(""); setLoadError("");
    void Promise.all([api.catalogList({}), api.libraryList({}), api.favoritesList({})])
      .then(([works, items, ids]) => {
        if (live && latest.current.scope === scope && latest.current.binding === binding && latest.current.ready) {
          setCatalog(works); setEntries(items); setFavorites(ids); setLoaded({ scope, binding });
        }
      }).catch(() => { if (live) setLoadError("书架暂时无法读取，请刷新重试。"); });
    return () => { live = false; };
  }, [api, scope, binding, scopeReady]);

  async function save(workId: string, revision: number, status: string, note?: string) {
    const check = account.guard(), captured = latest.current;
    const result = await api.libraryEdit({ params: { id: workId }, body: { revision, status, ...(note === undefined ? {} : { note }) } });
    check();
    if (latest.current.scope !== captured.scope || latest.current.binding !== captured.binding || !latest.current.ready) throw new AccountClientError("IDENTITY_CHANGED");
    setEntries(current => [...current.filter(item => item.workId !== workId), result]); return result;
  }
  async function beginReading(target:{versionId:string;url:string}) {
    await run(async()=>{
      const check=account.guard(),captured=latest.current;
      if(!captured.ready)throw new AccountClientError("IDENTITY_CHANGED");
      const session=await api.playStart({ body: {versionId:target.versionId,eventId:crypto.randomUUID()} });check();
      if(latest.current.scope!==captured.scope||latest.current.binding!==captured.binding||!latest.current.ready)throw new AccountClientError("IDENTITY_CHANGED");
      navigate(`${target.url}?session=${encodeURIComponent(session.id)}`,{state:{startReading:target.versionId}});
    });
  }
  const ids = shelfWorkIds(entries, favorites), matches = catalog.filter(work => work.title.toLowerCase().includes(addQuery.toLowerCase()));
  const allItems = ids.flatMap(id => {
    const work = catalog.find(work => work.id === id), entry = entries.find(entry => entry.workId === id);
    return work ? [{ work, entry }] : [];
  });
  const shown=allItems.filter(({work,entry})=>work.title.toLowerCase().includes(query.toLowerCase())&&(filter==="all"||filter==="favorites"&&favorites.includes(work.id)||entry?.status===filter));
  return <section className="account-library" hidden={!["library", "saves"].includes(view)}>
    <div hidden={view !== "library"} className="space-y-6">
      <div className="shelf-controls">
        <div className="field"><Label htmlFor="library-search">搜索我的书架</Label><Input id="library-search" type="search" value={visible ? query : ""} disabled={!visible} onChange={event => setQuery(event.target.value)} placeholder="作品标题" /></div>
        <div className="field"><Label htmlFor="library-status">阅读状态</Label><NativeSelect id="library-status" value={filter} onChange={event => setFilter(event.target.value)}><NativeSelectOption value="all">全部作品</NativeSelectOption><NativeSelectOption value="favorites">已收藏</NativeSelectOption>{Object.entries(statuses).map(([value,label])=><NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></div>
      </div>
      <details className="shelf-add"><summary>添加作品到书架</summary>
        <div className="field"><Label htmlFor="shelf-add-search">寻找作品</Label><Input id="shelf-add-search" type="search" value={addQuery} onChange={event=>setAddQuery(event.target.value)} placeholder="搜索整个目录" /></div>
        <div className="flex flex-wrap gap-3 mt-4"><NativeSelect aria-label="选择故事" value={visible?selected:""} disabled={!visible} onChange={event=>setSelected(event.target.value)}><NativeSelectOption value="">选择一部作品…</NativeSelectOption>{matches.map(work=><NativeSelectOption key={work.id} value={work.id}>{work.title}</NativeSelectOption>)}</NativeSelect>
          <Button disabled={!visible||!selected||entries.some(entry=>entry.workId===selected)} onClick={()=>void run(async()=>{if(entries.some(entry=>entry.workId===selected))return;await save(selected,0,"wanted");})}>加入书架</Button></div>
      </details>
      {!visible ? <p role={loadError?"alert":"status"}>{loadError||"正在更新书架显示…"}</p> : <>
        {!shown.length&&<div className="empty-state"><h2>{ids.length?"没有匹配的作品":"书架还空着"}</h2><p>{ids.length?"试试其他标题或阅读状态。":"在作品页加入书架，或收藏一部想读的故事。"}</p><Button asChild variant="outline"><Link to="/">发现故事</Link></Button></div>}
        <div className="shelf-list">{allItems.map(({work,entry})=><Book key={binding+":"+work.id+":"+draftGeneration} draft={drafts.current.get(binding+":"+work.id)} remember={draft=>drafts.current.set(binding+":"+work.id,draft)} hidden={!shown.some(item=>item.work.id===work.id)} work={work} entry={entry} favorite={favorites.includes(work.id)} notesReadOnly={notesReadOnly||!!entry?.noteHidden} dirty={value=>markDirty(work.id,value)} save={(revision,status,note)=>save(work.id,revision,status,note)} start={versionId=>{
          const version=work.versions.find(version=>version.id===versionId);if(!version)return;
          const target={versionId,url:version.url};if(dirty)setPendingReading(target);else void beginReading(target);
        }}/>)}</div></>}
      <p className="text-sm text-muted-foreground">收藏与阅读状态分别保存。阅读时长是前台停留估算，游戏进度仍需在游戏内存档。</p>
    </div>
    <div hidden={view !== "saves"} className="space-y-4"><p className="text-muted-foreground">管理云端备份与分享。本机副本在对应作品的阅读器中管理。</p><CloudBackups account={account} catalog={catalog} run={run}/></div>
    <AlertDialog open={blocker.state === "blocked"||!!pendingReading} onOpenChange={open=>{if(!open){setPendingReading(null);if(blocker.state==="blocked")blocker.reset();}}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>有尚未保存的阅读记录</AlertDialogTitle><AlertDialogDescription>返回编辑可以继续保存；离开只会放弃这次修改，已保存的记录仍保留。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>返回编辑</AlertDialogCancel><AlertDialogAction onClick={()=>{const target=pendingReading;setPendingReading(null);drafts.current.clear();dirtyWorks.current.clear();setDirty(false);setDraftGeneration(value=>value+1);if(blocker.state==="blocked")blocker.proceed();else if(target)void beginReading(target);}}>放弃修改并离开</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}

function Book({work,entry,favorite,notesReadOnly,save,start,dirty:notifyDirty,hidden,draft,remember}:{work:CatalogItem;entry?:LibraryEntry;favorite:boolean;notesReadOnly:boolean;save:(revision:number,status:string,note?:string)=>Promise<LibraryEntry>;start:(version:string)=>void;dirty:(value:boolean)=>void;hidden:boolean;draft?:BookDraft;remember:(draft:BookDraft)=>void}) {
  const [editing,setEditing]=useState(draft?.editing??false),[status,setStatus]=useState(draft?.status??entry?.status??"wanted"),[note,setNote]=useState(draft?.note??entry?.note??""),[revision,setRevision]=useState(draft?.revision??entry?.revision??0);
  const [base,setBase]=useState(draft?.base??{status:entry?.status??"wanted",note:entry?.note??""}),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [version,setVersion]=useState(draft?.version??(entry?.lastVersionId&&work.versions.some(v=>v.id===entry.lastVersionId)?entry.lastVersionId:work.versions[0]?.id??""));
  const dirty=status!==base.status||!notesReadOnly&&note!==base.note;
  const dirtyCallback=useRef(notifyDirty);dirtyCallback.current=notifyDirty;
  const rememberRef=useRef(remember);rememberRef.current=remember;
  useEffect(()=>{rememberRef.current({editing,status,note,revision,base,version})},[editing,status,note,revision,base,version]);
  useEffect(()=>{dirtyCallback.current(dirty)},[dirty]);
  useEffect(()=>{if(!dirty&&note===base.note){setStatus(entry?.status??"wanted");setNote(entry?.note??"");setRevision(entry?.revision??0);setBase({status:entry?.status??"wanted",note:entry?.note??""})}},[entry?.revision]);
  async function saveRecord(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result=await save(revision,status,notesReadOnly||note===base.note?undefined:note);
      setRevision(result.revision); setBase({status,note:notesReadOnly?base.note:note}); setMessage("阅读记录已保存。");
    } catch(error) {
      setMessage(error instanceof AccountClientError&&["LIBRARY_CONFLICT","REVISION_CONFLICT","CONTENT_CONFLICT"].includes(error.code)
        ? "记录已在其他页面更新。你的草稿仍保留，请刷新后核对。"
        : errorCopy(error instanceof AccountClientError?error.code:"NETWORK"));
    } finally { setBusy(false); }
  }
  return <article className="shelf-row" data-shelf-work={work.id} hidden={hidden}>
    <div className="shelf-row-heading"><div><h3><Link to={work.url}>{work.title}</Link></h3><p>{entry?statuses[entry.status as keyof typeof statuses]:"未记录阅读状态"}{favorite?" · 已收藏":""}{entry?` · 约 ${Math.floor(entry.seconds/60)} 分钟`:""}</p></div>
      <div className="shelf-actions"><Button disabled={!version||busy} onClick={()=>start(version)}>{entry?.lastVersionId?"打开上次版本":"开始阅读"}</Button><Button variant="ghost" aria-expanded={editing} aria-controls={`shelf-editor-${work.id}`} onClick={()=>setEditing(!editing)}>{editing?"收起编辑":"编辑阅读记录"}</Button></div></div>
    <div id={`shelf-editor-${work.id}`} className="shelf-editor" hidden={!editing}>
      <form onSubmit={saveRecord}>
        <Label htmlFor={`status-${work.id}`}>阅读状态</Label><NativeSelect id={`status-${work.id}`} value={status} onChange={event=>setStatus(event.target.value)}>{Object.entries(statuses).map(([value,label])=><NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect>
        <Label htmlFor={`note-${work.id}`}>私人笔记</Label><Textarea id={`note-${work.id}`} value={notesReadOnly?"":note} disabled={notesReadOnly} onChange={event=>setNote(event.target.value)} maxLength={5000} placeholder="记下上次停在哪一章…"/>
        {notesReadOnly&&<p>公共浏览中私人笔记已收起；原记录仍保留，可在浏览设置中开启后编辑。</p>}
        <div className="flex flex-wrap gap-3 items-center"><Button type="submit" disabled={busy||!dirty&&!!entry}>{busy?"正在保存…":"保存阅读记录"}</Button><span className="text-sm text-muted-foreground" role="status">{message||(dirty?"有未保存的修改":"")}</span></div>
      </form>
      <div className="field mt-6"><Label htmlFor={`version-${work.id}`}>下次阅读的版本</Label><NativeSelect id={`version-${work.id}`} value={version} onChange={event=>setVersion(event.target.value)}>{work.versions.map(version=><NativeSelectOption key={version.id} value={version.id}>版本 {version.number} · {version.title}</NativeSelectOption>)}</NativeSelect><p>各版本存档分别保留；切换不会复制存档。</p></div>
    </div>
  </article>;
}
