import { useEffect, useId, useRef, useState } from "react";
import type { ClassificationRecord, ClassificationReviewRecord, WorkReviewSnapshot } from "./classification.server.ts";
import type { PublicWork } from "../types.ts";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { NativeSelect, NativeSelectOption } from "../components/ui/native-select";
import { Card, CardHeader, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/table";

type Api = (path: string, method?: string, body?: unknown) => Promise<any>;
const labels: Record<string, string> = {
  work: "作品页面", version: "游玩版本", image: "单张图片", unknown: "待核实", sfw: "SFW 页面", nsfw: "NSFW 页面",
  none: "已确认不含成人性内容", present: "含成人性内容", safe: "无性内容", suggestive: "含性暗示", explicit: "露骨性内容",
  tame: "无显著暴力", violent: "暴力", brutal: "强烈暴力", stale: "文案已变化，需复审",
};
const keyOf = (record: Pick<ClassificationRecord, "kind" | "id">) => record.kind + ":" + record.id;
function entries(records: ClassificationReviewRecord[], catalog: PublicWork[]) {
  const values = new Map(records.map(record => [keyOf(record), record]));
  const names = new Map<string, string>();
  const missing = { reason: "", source: "manual:", reviewedAt: "", revision: 0 };
  for (const work of catalog) {
    const key = "work:" + work.id;
    names.set(key, work.title);
    for (const version of work.versions) {
      const key = "version:" + version.id;
      names.set(key, work.title + " · " + version.title);
      if (!values.has(key)) values.set(key, { kind: "version", id: version.id, manual: false, classification: { ...missing, sexualContent: "unknown", titleSafe: false } });
    }
    for (const [index, image] of [work.metadata?.cover, ...(work.metadata?.screenshots ?? [])].entries()) {
      if (!image) continue;
      const key = "image:" + image.url;
      const name = work.title + (index ? " · 截图 " + index : " · 封面");
      names.set(key, names.has(key) ? names.get(key) + " / " + name : name);
      if (!values.has(key)) values.set(key, { kind: "image", id: image.url, manual: false,
        classification: { ...missing, source: image.sourceUrl, sexual: "unknown", violence: "unknown", spoiler: true } });
    }
  }
  for (const record of values.values()) if (record.kind === "work" && record.reviewText) names.set(keyOf(record), record.reviewText.title);
  return { values: [...values.values()], names };
}
function statusOf(record: ClassificationReviewRecord): string[] {
  if (record.kind === "work") {
    return record.fingerprint !== record.reviewFingerprint && record.classification.pageSuitability !== "unknown"
      ? ["stale"] : [record.classification.pageSuitability];
  }
  return record.kind === "version" ? [record.classification.sexualContent] : [record.classification.sexual, record.classification.violence];
}

export function ContentClassificationManagement({ api, catalog, onSaved }: { api: Api; catalog: PublicWork[]; onSaved: () => Promise<void> }) {
  const [records, setRecords] = useState<ClassificationReviewRecord[]>([]);
  const [kind, setKind] = useState("work");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [limit, setLimit] = useState(50);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const editor = useRef<HTMLDivElement>(null);
  async function refresh() { setRecords(await api("content-classification")); setLoaded(true); }
  useEffect(() => { void refresh().catch(error => setMessage((error as Error).message)); }, []);
  useEffect(() => { if (selected) editor.current?.scrollIntoView({ block: "start" }); }, [selected]);
  const listed = entries(records, loaded ? catalog : []);
  const record = listed.values.find(value => keyOf(value) === selected);
  const originalImage = record?.kind === "image" ? catalog.flatMap(work => [work.metadata?.cover, ...(work.metadata?.screenshots ?? [])])
    .find(image => image?.url === record.id)?.sourceUrl : undefined;
  const reviewText = record?.kind === "work" ? record.reviewText : undefined;
  const currentWork = record?.kind === "version" ? catalog.find(work => work.versions.some(version => version.id === record.id)) : undefined;
  const needle = query.trim().toLowerCase();
  const filtered = listed.values.filter(value => (!kind || value.kind === kind)
    && (!status || statusOf(value).includes(status))
    && (!needle || (value.id + " " + listed.names.get(keyOf(value))).toLowerCase().includes(needle)));
  async function save(form: HTMLFormElement, record: ClassificationReviewRecord) {
    const fields = new FormData(form);
    const evidence = { reason: String(fields.get("reason") ?? "").trim(), source: String(fields.get("source") ?? "").trim(), reviewedAt: new Date().toISOString() };
    let payload: Record<string, unknown> = { ...evidence };
    if (record.kind === "work") payload.pageSuitability = fields.get("pageSuitability");
    else if (record.kind === "version") payload = { ...payload, sexualContent: fields.get("sexualContent"), titleSafe: fields.has("titleSafe"),
      ...(String(fields.get("ageRating") ?? "").trim() ? { ageRating: String(fields.get("ageRating")).trim() } : {}) };
    else {
      payload = { ...payload, sexual: fields.get("sexual"), violence: fields.get("violence"), spoiler: fields.has("spoiler") };
      for (const key of ["rawSexual", "rawViolence", "voteCount"]) {
        const value = String(fields.get(key) ?? "").trim();
        if (value) payload[key] = Number(value);
      }
    }
    setBusy(true); setMessage("");
    try {
      const result = await api("content-classification", "PATCH", { kind: record.kind, id: record.id, expectedRevision: record.classification.revision,
        ...(record.kind === "work" ? { expectedFingerprint: record.reviewFingerprint } : {}), payload });
      await refresh();
      await onSaved();
      setMessage("审核已保存，修订 " + result.revision + "。人工审核将优先于后续批量导入。");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section aria-label="内容分类管理" className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2>内容分类与证据</h2><p className="muted">分别审核页面、实际游玩版本和单张图片。文案变更会要求页面复审。</p></div>
      <Button variant="outline" disabled={busy} onClick={() => void refresh().then(onSaved).catch(error => setMessage(error.message))}>刷新分类</Button></div>
    <div role="status" aria-live="polite">{message}</div>
    {!loaded && <p role="status">正在读取分类记录…</p>}
    <div className="grid gap-3 md:grid-cols-3">
      <Label className="field">分类层级<NativeSelect value={kind} onChange={event => { setKind(event.target.value); setLimit(50); }}><NativeSelectOption value="">全部层级</NativeSelectOption>{["work", "version", "image"].map(value => <NativeSelectOption key={value} value={value}>{labels[value]}</NativeSelectOption>)}</NativeSelect></Label>
      <Label className="field">编号或名称<Input value={query} onChange={event => { setQuery(event.target.value); setLimit(50); }} placeholder="作品、版本编号或图片缓存 URL" /></Label>
      <Label className="field">分类状态<NativeSelect value={status} onChange={event => { setStatus(event.target.value); setLimit(50); }}><NativeSelectOption value="">全部状态</NativeSelectOption>{["unknown", "stale", "sfw", "nsfw", "none", "present", "safe", "suggestive", "explicit", "tame", "violent", "brutal"].map(value => <NativeSelectOption key={value} value={value}>{labels[value]}</NativeSelectOption>)}</NativeSelect></Label>
    </div>
    {record && <div ref={editor}><Card><CardHeader><h3>审核：{listed.names.get(keyOf(record)) ?? record.id}</h3><p className="break-all text-sm">{labels[record.kind]} · {record.id}</p>
      <p className="muted">修订 {record.classification.revision} · {record.manual ? "人工覆盖" : "导入或尚未审核"}{record.classification.reviewedAt && " · 上次核实 " + record.classification.reviewedAt}</p>
      {originalImage && <p><a href={originalImage} target="_blank" rel="noreferrer">打开登记的来源原图（新窗口）</a></p>}
      {reviewText && <WorkReviewText text={reviewText} />}
      {currentWork && <details className="space-y-2"><summary>核对当前页面与版本文案</summary><div className="space-y-2 text-sm">
        <p><strong>{currentWork.title}</strong> · {currentWork.originalTitle}</p><p>别名：{currentWork.aliases.join(" / ") || "无"}</p>
        <p>其他标题：{currentWork.metadata?.titles.map(title => title.title).join(" / ") || "无"}</p>
        <p className="whitespace-pre-wrap">{currentWork.metadata?.description || "暂无简介"}</p>
        <p>标签：{currentWork.metadata?.tags.map(tag => tag.name).join(" / ") || "无"}</p>
        <p>开发者：{currentWork.metadata?.developers.join(" / ") || "未标注"}；语言：{currentWork.metadata?.languages.join(" / ") || "未标注"}；平台：{currentWork.metadata?.platforms.join(" / ") || "未标注"}；日期：{currentWork.metadata?.released || "未标注"}</p>
        <p>警示：{currentWork.metadata?.warnings.join(" / ") || "无"}</p>
        <p className="break-all">来源：{currentWork.metadata?.sources.map(source => source.url).join(" / ") || currentWork.evidence}</p>
        {currentWork.versions.filter(version => version.id === record.id)
          .map(version => <div key={version.id} className="space-y-1"><strong>版本 {version.number} · {version.title}</strong><p>语言：{version.language}</p><p className="whitespace-pre-wrap">说明：{version.notes || "无"}</p></div>)}
      </div></details>}
      {statusOf(record).includes("stale") && <p role="alert">页面文案已变化，旧审核暂不用于公开发现。请核对本次页面及版本文案快照后重新保存。</p>}</CardHeader>
      <CardContent><ClassificationEditor key={keyOf(record) + ":" + record.classification.revision + ":" + record.reviewFingerprint} record={record}
        busy={busy || record.kind === "work" && !record.reviewFingerprint} save={form => save(form, record)} /></CardContent></Card></div>}
    <p>{filtered.length} 条匹配记录；当前显示 {Math.min(filtered.length, limit)} 条。</p>
    <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>对象</TableHead><TableHead>状态</TableHead><TableHead>修订</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>
      {filtered.slice(0, limit).map(value => <TableRow key={keyOf(value)}><TableCell><strong>{listed.names.get(keyOf(value)) ?? labels[value.kind]}</strong><p className="break-all text-xs">{labels[value.kind]} · {value.id}</p><p className="max-w-xl text-sm">{value.classification.reason || "尚无审核理由"}</p><p className="max-w-xl break-all text-xs text-muted-foreground">来源：{value.classification.source}</p></TableCell>
        <TableCell>{statusOf(value).map((state, index) => <Badge key={state + index} variant="outline">{labels[state] ?? state}</Badge>)}</TableCell><TableCell>{value.classification.revision}{value.manual && <p className="text-xs">人工覆盖</p>}</TableCell>
        <TableCell><Button type="button" variant="outline" disabled={busy} aria-pressed={selected === keyOf(value)} onClick={() => setSelected(keyOf(value))}>审核</Button></TableCell></TableRow>)}
    </TableBody></Table></div>
    {filtered.length > limit && <Button variant="outline" onClick={() => setLimit(limit + 50)}>再显示 50 条</Button>}
  </section>;
}

function WorkReviewText({ text }: { text: WorkReviewSnapshot["reviewText"] }) {
  return <details className="space-y-2"><summary>核对本次页面与版本文案快照</summary><div className="space-y-2 text-sm">
    <p><strong>{text.title}</strong> · {text.originalTitle}</p><p>别名：{text.aliases.join(" / ") || "无"}</p>
    <p>其他标题：{text.metadata?.titles.map(title => title.title).join(" / ") || "无"}</p>
    <p className="whitespace-pre-wrap">{text.metadata?.description || "暂无简介"}</p>
    <p>标签：{text.metadata?.tags.map(tag => tag.name).join(" / ") || "无"}</p>
    <p>开发者：{text.metadata?.developers.join(" / ") || "未标注"}；语言：{text.metadata?.languages.join(" / ") || "未标注"}；平台：{text.metadata?.platforms.join(" / ") || "未标注"}；日期：{text.metadata?.released || "未标注"}</p>
    <p>警示：{text.metadata?.warnings.join(" / ") || "无"}</p><p className="break-all">来源：{text.metadata?.sources.map(source => source.url).join(" / ") || text.evidence}</p>
    {text.versions.map(version => <div key={version.id} className="space-y-1"><strong>版本 · {version.title}</strong><p className="break-all">{version.id}</p><p>语言：{version.language}</p><p className="whitespace-pre-wrap">说明：{version.notes || "无"}</p></div>)}
  </div></details>;
}

function ClassificationEditor({ record, busy, save }: { record: ClassificationRecord; busy: boolean; save: (form: HTMLFormElement) => Promise<void> }) {
  const id = useId();
  const select = (name: string, label: string, value: string, options: string[]) => <Label className="field" htmlFor={id + name}>{label}<NativeSelect id={id + name} name={name} defaultValue={value}>{options.map(option => <NativeSelectOption key={option} value={option}>{labels[option]}</NativeSelectOption>)}</NativeSelect></Label>;
  return <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(event.currentTarget); }}>
    <fieldset disabled={busy} className="space-y-4"><legend className="sr-only">审核分类与证据</legend>
      {record.kind === "work" && select("pageSuitability", "页面适宜性", record.classification.pageSuitability, ["unknown", "sfw", "nsfw"])}
      {record.kind === "version" && <>{select("sexualContent", "实际版本性内容", record.classification.sexualContent, ["unknown", "none", "present"])}
        <p className="muted">“不含成人性内容”不表示适合所有年龄；需要与本站实际资源包及补丁状态相符的证据。</p>
        <Label className="flex items-center gap-2"><input type="checkbox" name="titleSafe" defaultChecked={record.classification.titleSafe} />版本标题已审核，可在公共浏览显示</Label>
        <Label className="field">有证据的年龄分级（可留空）<Input name="ageRating" maxLength={100} defaultValue={record.classification.ageRating ?? ""} /></Label></>}
      {record.kind === "image" && <><div className="grid gap-3 sm:grid-cols-2">{select("sexual", "图片性内容", record.classification.sexual, ["unknown", "safe", "suggestive", "explicit"])}{select("violence", "图片暴力内容", record.classification.violence, ["unknown", "tame", "violent", "brutal"])}</div>
        <Label className="flex items-center gap-2"><input type="checkbox" name="spoiler" defaultChecked={record.classification.spoiler} />可能涉及剧透，或尚未核实</Label>
        <div className="grid gap-3 sm:grid-cols-3"><Label className="field">原始性内容平均分<Input name="rawSexual" type="number" min={0} max={2} step="any" defaultValue={record.classification.rawSexual ?? ""} /></Label><Label className="field">原始暴力平均分<Input name="rawViolence" type="number" min={0} max={2} step="any" defaultValue={record.classification.rawViolence ?? ""} /></Label><Label className="field">原始评分票数<Input name="voteCount" type="number" min={0} step={1} defaultValue={record.classification.voteCount ?? ""} /></Label></div>
        <p className="muted">保留来源中的 0–2 小数与票数。无票、缺字段或非 VNDB 素材需明确人工审核；“可信来源”本身不等于图片安全。</p></>}
      <Label className="field">审核理由<Textarea name="reason" required maxLength={4000} defaultValue={record.classification.reason} placeholder="记录检查范围、判定依据和仍缺少的证据" /></Label>
      <Label className="field">证据来源<Input name="source" required maxLength={2000} defaultValue={record.classification.source} placeholder="对应来源链接或人工审核记录" /></Label>
      <p className="muted">保存时记录本次核实时间。页面审核只批准上方所见的文案快照；文案已变化时请刷新分类并重新核对。</p>
      <Button type="submit">{busy ? "正在保存…" : "保存审核"}</Button>
    </fieldset>
  </form>;
}
